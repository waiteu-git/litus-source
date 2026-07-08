import { useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { loadCourseMap } from '../storage/courseMapStore'
import { loadCourseSnapshots } from '../storage/courseSnapshotStore'
import { COLLECT_COURSE_PAGE_JS, DESKTOP_UA } from './injectedScripts'
import { filterAssignmentCandidates } from '../updates/assignmentCandidates'
import { selectAssignmentsToVisit } from '../updates/assignmentWindow'
import { parseAssignmentPage } from '../parsers/letus'
import { upsertAssignments, type CollectedAssignment } from '../updates/assignmentUpsert'
import { loadAssignments, saveAssignments } from '../storage/assignmentsStore'
import { refreshAllNotifications } from '../notifications/notificationRefresh'
import { useAssignmentsVersion } from '../assignments/assignmentsVersion'

type Candidate = { url: string; title: string; courseName: string; courseCode: string | null }

// 1ページの読込がハングした場合の保険。超えたら次の候補へ進む。
const PAGE_TIMEOUT_MS = 15000

/**
 * 課題収集のheadlessエンジン。マウントすると候補列挙→LETUS課題ページをWebViewで逐次巡回→
 * パース→upsert保存→通知貼り直し→version bump まで行い onFinished を呼ぶ。
 * 収集画面とバックグラウンド収集の両方から使う（LETUSのみに触る。CLASS背景禁止の原則の対象外）。
 */
export default function AssignmentCollector({
  onProgress,
  onFinished,
}: {
  onProgress?: (done: number, total: number) => void
  onFinished: (r: { checked: number; saved: number }) => void
}) {
  const webviewRef = useRef<WebView>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [index, setIndex] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const doneRef = useRef(false)
  const collectedRef = useRef<CollectedAssignment[]>([])
  const { bump } = useAssignmentsVersion()

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
      // ±2週間の窓で訪問対象を絞る（新規＋締切不明＋窓内のみ）。窓外の既知課題は保存済みを維持。
      const existing = await loadAssignments()
      setCandidates(selectAssignmentsToVisit(list, existing))
      setLoaded(true)
    })()
  }, [])

  const current = candidates[index]

  // ページ読込ハングの保険（onMessageが来なくても先へ進む）。
  useEffect(() => {
    if (!loaded || !current) return
    const t = setTimeout(() => setIndex((i) => i + 1), PAGE_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [loaded, index, current])

  useEffect(() => {
    if (loaded && current && onProgress) {
      onProgress(Math.min(index + 1, candidates.length), candidates.length)
    }
  }, [loaded, index, current, candidates.length, onProgress])

  function onMessage(data: string) {
    let payload: { type?: string; html?: string }
    try {
      payload = JSON.parse(data)
    } catch {
      setIndex((i) => i + 1)
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
    setIndex((i) => i + 1)
  }

  useEffect(() => {
    if (!loaded || index < candidates.length || doneRef.current) return
    doneRef.current = true
    ;(async () => {
      if (collectedRef.current.length > 0) {
        const existing = await loadAssignments()
        await saveAssignments(upsertAssignments(existing, collectedRef.current, new Date()))
        await refreshAllNotifications()
        bump()
      }
      onFinished({ checked: candidates.length, saved: collectedRef.current.length })
    })()
  }, [loaded, index, candidates.length, bump, onFinished])

  const webview = useMemo(() => {
    if (!current) return null
    return (
      <WebView
        ref={webviewRef}
        source={{ uri: current.url }}
        // パーサのfixtureはデスクトップDOM実測。モバイルUAだとLETUSのDOMが変わり
        // 提出状態などの解析に失敗する（実機で「状態不明」の原因）。
        userAgent={DESKTOP_UA}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        onLoadEnd={() => webviewRef.current?.injectJavaScript(COLLECT_COURSE_PAGE_JS)}
        onMessage={(e) => onMessage(e.nativeEvent.data)}
        style={styles.webview}
      />
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.url])

  return <View style={styles.box}>{webview}</View>
}

const styles = StyleSheet.create({
  box: { height: 1, opacity: 0 },
  webview: { height: 1, opacity: 0 },
})
