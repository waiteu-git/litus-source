import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { COLLECT_COURSE_PAGE_JS, COLLECT_MYCOURSES_JS, MYCOURSES_URL } from './injectedScripts'
import { parseMyCoursesMessage } from './myCoursesMessage'
import { buildCourseCodeMap } from '../parsers/letusCourses'
import { loadCourseMap, saveCourseMap } from '../storage/courseMapStore'
import { computeCourseSignature, diffCourseSignature } from '../updates/courseUpdates'
import { loadCourseSnapshots, saveCourseSnapshots } from '../storage/courseSnapshotStore'
import type { CourseSnapshotMap } from '../storage/courseSnapshotSerialize'
import { useAuth } from '../auth/AuthProvider'
import AssignmentCollector from './AssignmentCollector'

// 各ステージ/ページの読込がハングした場合の保険。
const COURSES_TIMEOUT_MS = 25000
const PAGE_TIMEOUT_MS = 15000
// タブ入場直後の描画と競合しないよう開始を遅らせる。
const START_DELAY_MS = 2000
// LETUSのSSO確立を待つ上限。超えたら（判定unknownでも）ダメ元で開始する。
const AUTH_WAIT_MS = 30000
// コース収集の空振り（SSOリダイレクト途中など）リトライ回数。
const COURSES_MAX_TRIES = 3

type Stage = 'idle' | 'courses' | 'snapshots' | 'assignments' | 'done'

/**
 * タブ入場（authed）後に1回だけLETUS側を全自動同期する:
 * コース収集（マイコース1ページ）→コースページ巡回（スナップショット更新）→課題収集。
 * 全てLETUSのみに触るため、CLASS（出席/時間割）のWebViewと競合しない。
 * 各ステージは失敗しても次へ進む（次回起動で再試行される）。初回はコース0件でも
 * コース収集から始まるので、ログインさえ済めばユーザー操作ゼロで課題・通知が揃う。
 */
export default function BackgroundLetusSync() {
  const [stage, setStage] = useState<Stage>('idle')
  const stageRef = useRef<Stage>('idle')
  stageRef.current = stage
  const auth = useAuth()

  const coursesWebviewRef = useRef<WebView>(null)
  const pageWebviewRef = useRef<WebView>(null)
  const [urls, setUrls] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [coursesTry, setCoursesTry] = useState(0)
  const snapshotsRef = useRef<CourseSnapshotMap>({})
  const snapshotsSavedRef = useRef(false)

  // LETUSのSSO確立（AuthProviderのウォームアップ完了）を待ってから開始する。
  // 早すぎるとマイコースの代わりにSSOリダイレクト途中を掴んで空振りする（実機で確認）。
  useEffect(() => {
    if (stage !== 'idle') return
    if (auth.letus === 'authenticated') {
      const t = setTimeout(() => setStage('courses'), START_DELAY_MS)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setStage((s) => (s === 'idle' ? 'courses' : s)), AUTH_WAIT_MS)
    return () => clearTimeout(t)
  }, [stage, auth.letus])

  // courses: マイコースを1ページ収集して courseMap を更新（失敗しても既存mapで先へ）。
  useEffect(() => {
    if (stage !== 'courses') return
    const t = setTimeout(() => setStage((s) => (s === 'courses' ? 'snapshots' : s)), COURSES_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [stage, coursesTry])

  async function onCoursesMessage(data: string) {
    if (stageRef.current !== 'courses') return
    const r = parseMyCoursesMessage(data)
    if (!r.error && r.courses.length > 0) {
      try {
        await saveCourseMap(buildCourseCodeMap(r.courses))
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
      const unique = [...new Set(Object.values(map).map((c) => c.url))]
      setUrls(unique)
      setIndex(0)
      if (unique.length === 0) setStage('assignments')
    })()
  }, [stage])

  const currentUrl = stage === 'snapshots' ? urls[index] : undefined

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
      } catch {
        // 保存失敗でも課題収集へ（既存スナップショットが使われる）
      }
      setStage('assignments')
    })()
  }, [stage, urls, index])

  if (stage === 'idle' || stage === 'done') return null
  return (
    <View style={styles.box}>
      {stage === 'courses' ? (
        <WebView
          key={`courses-${coursesTry}`}
          ref={coursesWebviewRef}
          source={{ uri: MYCOURSES_URL }}
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
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          onLoadEnd={() => pageWebviewRef.current?.injectJavaScript(COLLECT_COURSE_PAGE_JS)}
          onMessage={(e) => onPageMessage(e.nativeEvent.data)}
          style={styles.webview}
        />
      ) : null}
      {stage === 'assignments' ? <AssignmentCollector onFinished={() => setStage('done')} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { height: 1, opacity: 0 },
  webview: { height: 1, opacity: 0 },
})
