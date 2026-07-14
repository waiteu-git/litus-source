import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { COLLECT_COURSE_PAGE_JS, COLLECT_MYCOURSES_JS, DESKTOP_UA, MYCOURSES_URL } from './injectedScripts'
import { parseMyCoursesMessage } from './myCoursesMessage'
import { buildCourseCodeMap } from '../parsers/letusCourses'
import { loadCourseMap, saveCourseMap } from '../storage/courseMapStore'
import { loadAllCourses, saveAllCourses } from '../storage/allCoursesStore'
import { loadTrackedCourses } from '../storage/trackedCoursesStore'
import { trackedCourseInfos } from '../updates/courseTracking'
import { computeCourseSignature, diffCourseSignature } from '../updates/courseUpdates'
import { selectCoursesToSnapshot } from '../updates/courseSnapshotWindow'
import { loadCourseSnapshots, saveCourseSnapshots } from '../storage/courseSnapshotStore'
import type { CourseSnapshotMap } from '../storage/courseSnapshotSerialize'
import AssignmentCollector from './AssignmentCollector'
import { publishCourseNews } from './publishCourseNews'
import type { CourseRunDiff } from '../updates/courseNews'

// 各ステージ/ページの読込がハングした場合の保険。
const COURSES_TIMEOUT_MS = 25000
const PAGE_TIMEOUT_MS = 15000
// コース収集の空振り（SSOリダイレクト途中など）リトライ回数。
const COURSES_MAX_TRIES = 3

type Stage = 'courses' | 'snapshots' | 'assignments' | 'done'

/**
 * LETUSフル同期のheadlessエンジン: コース収集（マイコース1ページ）→コースページ巡回
 * （更新差分スナップショット）→課題収集。マウントで即開始し、進捗を onProgress で通知する
 * （初回セットアップのインジケータ表示用）。各ステージは失敗しても次へ進む（次回起動で再試行）。
 * 全てLETUSのみに触るため、CLASS（出席/時間割）のWebViewと競合しない。
 * 収集WebViewは **DESKTOP_UA 固定**: パーサのfixtureはデスクトップDOM実測で、モバイルUAだと
 * LETUSのDOMが変わり提出状態などの解析に失敗する。
 */
export default function LetusSyncEngine({
  onProgress,
  onFinished,
}: {
  onProgress?: (label: string) => void
  onFinished: () => void
}) {
  const [stage, setStage] = useState<Stage>('courses')
  const stageRef = useRef<Stage>('courses')
  stageRef.current = stage

  const coursesWebviewRef = useRef<WebView>(null)
  const pageWebviewRef = useRef<WebView>(null)
  const [urls, setUrls] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [coursesTry, setCoursesTry] = useState(0)
  const snapshotsRef = useRef<CourseSnapshotMap>({})
  const snapshotsSavedRef = useRef(false)
  const finishedRef = useRef(false)
  // このrunで実巡回したコースの増分（LETUS新着への転記用。未巡回コースの保持中addedは含めない）。
  const runDiffsRef = useRef<CourseRunDiff[]>([])
  // コースURL→表示名（新着の文言用）。courseMap から逆引き。
  const courseNamesRef = useRef<Map<string, string>>(new Map())

  function finish() {
    if (finishedRef.current) return
    finishedRef.current = true
    setStage('done')
    onFinished()
  }

  // courses: マイコースを1ページ収集して courseMap を更新（失敗しても既存mapで先へ）。
  useEffect(() => {
    if (stage !== 'courses') return
    onProgress?.('コースを取り込んでいます…')
    const t = setTimeout(() => setStage((s) => (s === 'courses' ? 'snapshots' : s)), COURSES_TIMEOUT_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, coursesTry])

  async function onCoursesMessage(data: string) {
    if (stageRef.current !== 'courses') return
    const r = parseMyCoursesMessage(data)
    if (!r.error && r.courses.length > 0) {
      try {
        await saveCourseMap(buildCourseCodeMap(r.courses))
        // 全コース（コード無し含む）も保存: 追跡候補（LETUS専用コース）の提示に使う。
        await saveAllCourses(r.courses)
      } catch {
        // 保存失敗でも既存mapで続行
      }
      setStage('snapshots')
      return
    }
    // 空振り（SSOリダイレクト途中・未ログイン等）→ 少し待ってWebViewを作り直して再試行。
    if (coursesTry < COURSES_MAX_TRIES) {
      setTimeout(() => {
        if (stageRef.current === 'courses') setCoursesTry((n) => n + 1)
      }, 3000)
    } else {
      setStage('snapshots')
    }
  }

  // snapshots: courseMap のコースページを逐次巡回してスナップショット（更新差分）を貯める。
  useEffect(() => {
    if (stage !== 'snapshots') return
    ;(async () => {
      const map = await loadCourseMap()
      snapshotsRef.current = await loadCourseSnapshots()
      for (const course of Object.values(map)) {
        if (!courseNamesRef.current.has(course.url)) courseNamesRef.current.set(course.url, course.name)
      }
      // 追跡中のLETUS専用コース（コード無し等・courseMap対象外）を巡回対象へ合流させる。
      // 名前も登録（LETUS新着の文言用）。取得失敗時は追跡なし扱いで従来どおり。
      let trackedUrls: string[] = []
      try {
        const tracked = trackedCourseInfos(await loadAllCourses(), await loadTrackedCourses())
        trackedUrls = tracked.map((t) => t.url)
        for (const t of tracked) {
          if (t.name && !courseNamesRef.current.has(t.url)) courseNamesRef.current.set(t.url, t.name)
        }
      } catch {
        // 追跡情報の読込失敗は無視（従来どおり courseMap のみ巡回）
      }
      const unique = [...new Set([...Object.values(map).map((c) => c.url), ...trackedUrls])]
      // 鮮度TTL内に収集済みのコースは course/view.php 再巡回をスキップする（保持スナップショットを
      // そのまま使う）。未収集/TTL超過/収集時刻破損のコースだけ巡回＝どのコースも最大TTLごとに
      // 必ず再巡回されるので新着課題・更新コースを取りこぼさない（発見遅延 ≤ TTL）。全コースが
      // 鮮度内なら空配列＝ステージ2を丸ごとスキップして課題ステージへ直行する。
      const toVisit = selectCoursesToSnapshot(unique, snapshotsRef.current, new Date())
      setUrls(toVisit)
      setIndex(0)
      if (toVisit.length === 0) setStage('assignments')
    })()
  }, [stage])

  const currentUrl = stage === 'snapshots' ? urls[index] : undefined

  useEffect(() => {
    if (stage === 'snapshots' && currentUrl) {
      onProgress?.(`コース内容を確認しています… ${Math.min(index + 1, urls.length)}/${urls.length}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, index, currentUrl, urls.length])

  // ページ読込ハングの保険。
  useEffect(() => {
    if (!currentUrl) return
    const t = setTimeout(() => setIndex((i) => i + 1), PAGE_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [currentUrl, index])

  function onPageMessage(data: string) {
    if (stageRef.current !== 'snapshots') return
    let payload: { type?: string; html?: string }
    try {
      payload = JSON.parse(data)
    } catch {
      setIndex((i) => i + 1)
      return
    }
    if (payload.type === 'coursepage' && typeof payload.html === 'string' && currentUrl) {
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
    }
    setIndex((i) => i + 1)
  }

  // snapshots 完走 → 保存して assignments へ。
  useEffect(() => {
    if (stage !== 'snapshots' || urls.length === 0 || index < urls.length || snapshotsSavedRef.current) return
    snapshotsSavedRef.current = true
    ;(async () => {
      try {
        await saveCourseSnapshots(snapshotsRef.current)
        // LETUS新着への転記は**保存成功時のみ**（UpdateCheckScreenと同順序）。保存失敗時に転記すると
        // 差分基準が前進しないまま新着だけ記録され、既読(markCourseSeen)後の再巡回で同じ活動が
        // 再検出されてNEWが復活する。失敗時は次回runが同じ差分を再検出するので取りこぼしは無い。
        await publishCourseNews(runDiffsRef.current)
      } catch {
        // 保存失敗でも課題収集へ（既存スナップショットが使われる）
      }
      setStage('assignments')
    })()
  }, [stage, urls, index])

  if (stage === 'done') return null
  return (
    <View style={styles.box}>
      {stage === 'courses' ? (
        <WebView
          key={`courses-${coursesTry}`}
          ref={coursesWebviewRef}
          source={{ uri: MYCOURSES_URL }}
          userAgent={DESKTOP_UA}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          onLoadEnd={() => coursesWebviewRef.current?.injectJavaScript(COLLECT_MYCOURSES_JS)}
          onMessage={(e) => onCoursesMessage(e.nativeEvent.data)}
          style={styles.webview}
        />
      ) : null}
      {stage === 'snapshots' && currentUrl ? (
        <WebView
          key={currentUrl}
          ref={pageWebviewRef}
          source={{ uri: currentUrl }}
          userAgent={DESKTOP_UA}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          onLoadEnd={() => pageWebviewRef.current?.injectJavaScript(COLLECT_COURSE_PAGE_JS)}
          onMessage={(e) => onPageMessage(e.nativeEvent.data)}
          style={styles.webview}
        />
      ) : null}
      {stage === 'assignments' ? (
        <AssignmentCollector
          onProgress={(d, t) => onProgress?.(`課題を取り込んでいます… ${d}/${t}`)}
          onFinished={finish}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { height: 1, opacity: 0 },
  webview: { height: 1, opacity: 0 },
})
