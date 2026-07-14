import { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { WebView } from 'react-native-webview'
import { ActionButton, ScreenBg, useUi } from '../ui/screen'
import { loadCourseMap } from '../storage/courseMapStore'
import { COLLECT_COURSE_PAGE_JS, DESKTOP_UA } from '../collect/injectedScripts'
import { computeCourseSignature, diffCourseSignature } from '../updates/courseUpdates'
import { loadCourseSnapshots, saveCourseSnapshots } from '../storage/courseSnapshotStore'
import type { CourseSnapshotMap } from '../storage/courseSnapshotSerialize'
import { publishCourseNews } from '../collect/publishCourseNews'
import type { CourseRunDiff } from '../updates/courseNews'

export default function UpdateCheckScreen() {
  const ui = useUi()
  const webviewRef = useRef<WebView>(null)
  const [urls, setUrls] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [done, setDone] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const snapshotsRef = useRef<CourseSnapshotMap>({})
  const [summary, setSummary] = useState<{ url: string; added: number; removed: number }[]>([])
  // このrunで実巡回したコースの増分（LETUS新着への転記用）とコース名の逆引き。
  const runDiffsRef = useRef<CourseRunDiff[]>([])
  const courseNamesRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    ;(async () => {
      const map = await loadCourseMap()
      snapshotsRef.current = await loadCourseSnapshots()
      for (const course of Object.values(map)) {
        if (!courseNamesRef.current.has(course.url)) courseNamesRef.current.set(course.url, course.name)
      }
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
    if (diff.added.length > 0) {
      runDiffsRef.current.push({
        url: currentUrl,
        name: courseNamesRef.current.get(currentUrl) ?? '',
        added: diff.added,
      })
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
      if (urls.length > 0) {
        // 保存→LETUS新着へ転記（自動同期と同じ共通ヘルパ・冪等なので二重転記しても再追加されない）。
        saveCourseSnapshots(snapshotsRef.current)
          .then(() => publishCourseNews(runDiffsRef.current))
          .catch(() => undefined)
      }
    }
  }, [loaded, index, urls, done])

  const changed = useMemo(() => summary.filter((s) => s.added + s.removed > 0), [summary])

  return (
    <ScreenBg>
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
        <Text style={[styles.heading, { color: ui.heading }]}>
          {done ? `完了（${urls.length}コース確認・${changed.length}コース更新あり）` : `確認中… ${Math.min(index + 1, urls.length)}/${urls.length}`}
        </Text>
        {done && urls.length === 0 ? (
          <Text style={[styles.info, { color: ui.labelColor }]}>コースがありません。先に「コース収集」を実行してください。</Text>
        ) : done && changed.length === 0 ? (
          <Text style={[styles.info, { color: ui.labelColor }]}>更新はありませんでした。</Text>
        ) : null}
        {changed.map((c) => (
          <Text key={c.url} style={[styles.row, { color: ui.valueColor }]}>{`+${c.added} / -${c.removed}  ${c.url}`}</Text>
        ))}
      </ScrollView>
      {done ? null : <ActionButton label="中断" onPress={() => setDone(true)} />}
    </ScreenBg>
  )
}

const styles = StyleSheet.create({
  hiddenWebview: { height: 1, opacity: 0 },
  body: { paddingBottom: 24 },
  heading: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  info: {},
  row: { paddingVertical: 4 },
})
