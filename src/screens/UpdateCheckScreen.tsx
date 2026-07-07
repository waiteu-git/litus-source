import { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { ActionButton } from '../ui/screen'
import { loadCourseMap } from '../storage/courseMapStore'
import { COLLECT_COURSE_PAGE_JS, DESKTOP_UA } from '../collect/injectedScripts'
import { computeCourseSignature, diffCourseSignature } from '../updates/courseUpdates'
import { loadCourseSnapshots, saveCourseSnapshots } from '../storage/courseSnapshotStore'
import type { CourseSnapshotMap } from '../storage/courseSnapshotSerialize'

export default function UpdateCheckScreen() {
  const webviewRef = useRef<WebView>(null)
  const [urls, setUrls] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [done, setDone] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const snapshotsRef = useRef<CourseSnapshotMap>({})
  const [summary, setSummary] = useState<{ url: string; added: number; removed: number }[]>([])

  useEffect(() => {
    ;(async () => {
      const map = await loadCourseMap()
      snapshotsRef.current = await loadCourseSnapshots()
      const unique = [...new Set(Object.values(map).map((c) => c.url))]
      setUrls(unique)
      setLoaded(true)
    })()
  }, [])

  const currentUrl = urls[index]

  async function onMessage(data: string) {
    let payload: { type?: string; html?: string; origin?: string; url?: string }
    try {
      payload = JSON.parse(data)
    } catch {
      next()
      return
    }
    if (payload.type !== 'coursepage' || typeof payload.html !== 'string' || !currentUrl) {
      next()
      return
    }
    const nextSig = computeCourseSignature(payload.html, currentUrl)
    const prev = snapshotsRef.current[currentUrl]
    const diff = prev ? diffCourseSignature(prev.activities, nextSig) : { added: [], removed: [] }
    snapshotsRef.current[currentUrl] = {
      activities: nextSig,
      collectedAt: new Date().toISOString(),
      added: diff.added,
      removed: diff.removed,
    }
    setSummary((s) => [...s, { url: currentUrl, added: diff.added.length, removed: diff.removed.length }])
    next()
  }

  function next() {
    setIndex((i) => i + 1)
  }

  useEffect(() => {
    if (loaded && index >= urls.length && !done) {
      setDone(true)
      if (urls.length > 0) saveCourseSnapshots(snapshotsRef.current)
    }
  }, [loaded, index, urls, done])

  const changed = useMemo(() => summary.filter((s) => s.added + s.removed > 0), [summary])

  return (
    <View style={styles.root}>
      {!done && currentUrl ? (
        <WebView
          ref={webviewRef}
          source={{ uri: currentUrl }}
          userAgent={DESKTOP_UA}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          onLoadEnd={() => webviewRef.current?.injectJavaScript(COLLECT_COURSE_PAGE_JS)}
          onMessage={(e) => onMessage(e.nativeEvent.data)}
          style={styles.hiddenWebview}
        />
      ) : null}
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.heading}>
          {done ? `完了（${urls.length}コース確認・${changed.length}コース更新あり）` : `確認中… ${Math.min(index + 1, urls.length)}/${urls.length}`}
        </Text>
        {done && urls.length === 0 ? (
          <Text style={styles.info}>コースがありません。先に「コース収集」を実行してください。</Text>
        ) : done && changed.length === 0 ? (
          <Text style={styles.info}>更新はありませんでした。</Text>
        ) : null}
        {changed.map((c) => (
          <Text key={c.url} style={styles.row}>{`+${c.added} / -${c.removed}  ${c.url}`}</Text>
        ))}
      </ScrollView>
      {done ? null : <ActionButton label="中断" onPress={() => setDone(true)} />}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hiddenWebview: { height: 1, opacity: 0 },
  body: { padding: 16 },
  heading: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  info: { color: '#666' },
  row: { paddingVertical: 4 },
})
