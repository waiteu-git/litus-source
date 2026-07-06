import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { loadCourseMap } from '../storage/courseMapStore'
import { loadCourseSnapshots } from '../storage/courseSnapshotStore'
import { COLLECT_COURSE_PAGE_JS } from '../collect/injectedScripts'
import { filterAssignmentCandidates } from '../updates/assignmentCandidates'
import { parseAssignmentPage } from '../parsers/letus'
import { upsertAssignments, type CollectedAssignment } from '../updates/assignmentUpsert'
import { loadAssignments, saveAssignments } from '../storage/assignmentsStore'
import { refreshAssignmentReminders } from '../notifications/assignmentSync'
import type { AssignmentsStackParamList } from '../navigation/types'

type Candidate = { url: string; title: string; courseName: string; courseCode: string | null }

export default function CollectAssignmentsScreen() {
  const webviewRef = useRef<WebView>(null)
  const navigation = useNavigation<NativeStackNavigationProp<AssignmentsStackParamList>>()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [index, setIndex] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [done, setDone] = useState(false)
  const collectedRef = useRef<CollectedAssignment[]>([])

  useEffect(() => {
    ;(async () => {
      const courseMap = await loadCourseMap()
      const snapshots = await loadCourseSnapshots()
      // courseUrl → {name, code} を courseMap から逆引き（コードなしコースはスナップショット対象外）。
      const urlInfo = new Map<string, { name: string; code: string | null }>()
      for (const course of Object.values(courseMap)) {
        if (!urlInfo.has(course.url)) {
          urlInfo.set(course.url, { name: course.name, code: course.codes[0] ?? null })
        }
      }
      const list: Candidate[] = []
      const seen = new Set<string>()
      for (const [courseUrl, snap] of Object.entries(snapshots)) {
        const info = urlInfo.get(courseUrl)
        for (const link of filterAssignmentCandidates(snap.activities)) {
          if (seen.has(link.url)) continue
          seen.add(link.url)
          list.push({
            url: link.url,
            title: link.title,
            courseName: info?.name ?? '',
            courseCode: info?.code ?? null,
          })
        }
      }
      setCandidates(list)
      setLoaded(true)
    })()
  }, [])

  const current = candidates[index]

  function onMessage(data: string) {
    let payload: { type?: string; html?: string }
    try {
      payload = JSON.parse(data)
    } catch {
      next()
      return
    }
    if (payload.type === 'coursepage' && typeof payload.html === 'string' && current) {
      const parsed = parseAssignmentPage(payload.html, current.url)
      collectedRef.current.push({
        url: current.url,
        courseCode: current.courseCode,
        courseName: current.courseName,
        title: current.title,
        deadline: parsed.deadline,
        deadlineText: '',
        submissionStatus: parsed.submissionStatus,
        lifecycleStatus: parsed.lifecycleStatus,
      })
    }
    next()
  }

  function next() {
    setIndex((i) => i + 1)
  }

  useEffect(() => {
    if (loaded && index >= candidates.length && !done) {
      setDone(true)
      ;(async () => {
        if (collectedRef.current.length > 0) {
          const existing = await loadAssignments()
          await saveAssignments(upsertAssignments(existing, collectedRef.current, new Date()))
          await refreshAssignmentReminders()
        }
      })()
    }
  }, [loaded, index, candidates, done])

  const collectedCount = useMemo(() => collectedRef.current.length, [done])

  return (
    <View style={styles.root}>
      {!done && current ? (
        <WebView
          ref={webviewRef}
          source={{ uri: current.url }}
          onLoadEnd={() => webviewRef.current?.injectJavaScript(COLLECT_COURSE_PAGE_JS)}
          onMessage={(e) => onMessage(e.nativeEvent.data)}
          style={styles.hiddenWebview}
        />
      ) : null}
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.heading}>
          {!loaded
            ? '候補を読み込み中…'
            : done
              ? `完了（${candidates.length}件確認・${collectedCount}件保存）`
              : `収集中… ${Math.min(index + 1, candidates.length)}/${candidates.length}`}
        </Text>
        {loaded && candidates.length === 0 ? (
          <Text style={styles.info}>
            課題候補がありません。先に時間割タブで「コース収集」→「更新チェック」を実行してください。
          </Text>
        ) : null}
        {done ? <Button title="課題一覧へ戻る" onPress={() => navigation.goBack()} /> : null}
      </ScrollView>
      {done ? null : <Button title="中断" onPress={() => setDone(true)} />}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hiddenWebview: { height: 1, opacity: 0 },
  body: { padding: 16 },
  heading: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  info: { color: '#666', marginBottom: 12 },
})
