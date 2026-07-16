import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { COLLECT_MYCOURSES_JS, DESKTOP_UA, MYCOURSES_URL } from './injectedScripts'
import { parseMyCoursesMessage } from './myCoursesMessage'
import { buildCourseCodeMap } from '../parsers/letusCourses'
import { saveCourseMap } from '../storage/courseMapStore'
import { saveAllCourses } from '../storage/allCoursesStore'
import AssignmentCollector from './AssignmentCollector'
import CourseUpdateEngine from './CourseUpdateEngine'

// コース収集の読込がハングした場合の保険。
const COURSES_TIMEOUT_MS = 25000
// コース収集の空振り（SSOリダイレクト途中など）リトライ回数。
const COURSES_MAX_TRIES = 3

type Stage = 'courses' | 'snapshots' | 'assignments' | 'done'

/**
 * LETUSフル同期のheadlessエンジン: コース収集（マイコース1ページ）→コースページ巡回
 * （更新差分スナップショット＝CourseUpdateEngine）→課題収集。マウントで即開始し、進捗を onProgress で
 * 通知する（初回セットアップのインジケータ表示用）。各ステージは失敗しても次へ進む（次回起動で再試行）。
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
  const [coursesTry, setCoursesTry] = useState(0)
  const finishedRef = useRef(false)

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
      {stage === 'snapshots' ? (
        // コース更新チェック（TTL内スキップ・保存→LETUS新着転記込み）。完了で課題収集へ。
        <CourseUpdateEngine onProgress={onProgress} onFinished={() => setStage('assignments')} />
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
