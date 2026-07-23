import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView, type WebViewInstance } from '../ui/GuardedWebView'
import { COLLECT_MYCOURSES_JS, DESKTOP_UA, MYCOURSES_URL } from './injectedScripts'
import { parseMyCoursesMessage } from './myCoursesMessage'
import { buildCourseCodeMap, parseMyCourses } from '../parsers/letusCourses'
import { saveCourseMap } from '../storage/courseMapStore'
import { loadAllCourses, saveAllCourses } from '../storage/allCoursesStore'
import AssignmentCollector from './AssignmentCollector'
import CourseUpdateEngine from './CourseUpdateEngine'
import {
  createScanAccumulator,
  observeActivityPage,
  observeCoursePage,
  observeDashboard,
} from '../health/scanDiagnostics'
import { recordScanCycleOutcome } from '../storage/diagnosticsStateStore'
import type { DiagnosticsState } from '../health/diagnosticsState'

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
  onDiagnostics,
}: {
  onProgress?: (label: string) => void
  onFinished: () => void
  /**
   * このサイクルの診断台帳が確定したら呼ぶ（recordScanCycleOutcome の解決値）。
   * reachedLetus=false（不完全サイクル）で記録されなかった場合は呼ばれない（state は不変）。
   * アプリ内の診断バナー（DiagnosticsProvider）を live 更新するための配線。
   */
  onDiagnostics?: (state: DiagnosticsState) => void
}) {
  const [stage, setStage] = useState<Stage>('courses')
  const stageRef = useRef<Stage>('courses')
  stageRef.current = stage

  const coursesWebviewRef = useRef<WebViewInstance>(null)
  const [coursesTry, setCoursesTry] = useState(0)
  const finishedRef = useRef(false)

  // 自己診断（diagnose）の集約器: このサイクル（コース→スナップショット→課題）を貫いて
  // 各面の矛盾コードを溜め、finish で1回だけ recordScanCycleOutcome に畳み込む（§4.4/§5.3）。
  const scanAccRef = useRef(createScanAccumulator())
  // Dashboard 診断用の「既知コース数（今回スキャンで上書きする前）」。0 初期＝初回/読込前は誤発火しない側へ倒す。
  const prevKnownCountRef = useRef(0)
  useEffect(() => {
    loadAllCourses()
      .then((courses) => {
        prevKnownCountRef.current = courses.length
      })
      .catch(() => undefined)
  }, [])

  function finish() {
    if (finishedRef.current) return
    finishedRef.current = true
    setStage('done')
    // 到達できたサイクルだけを畳み込む（reachedLetus=false の不完全サイクルは記録側で中立スキップ）。
    // 確定した診断台帳は診断バナー（DiagnosticsProvider）へ push して live 更新する。
    recordScanCycleOutcome(scanAccRef.current, new Date().toISOString())
      .then((state) => {
        if (state) onDiagnostics?.(state)
      })
      .catch(() => undefined)
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
    // 自己診断（Dashboard 面）: 取得HTMLから認証状態＋コースアンカー数を導出し、既知コース>0 なのに
    // 0 アンカー（5.x の全面クライアント描画等）を DASHBOARD_UNREADABLE として捕捉する。URL ゲートに
    // 依存せず html を直接パースする（アンカーの実在数を診断入力にするため）。
    try {
      const payload = JSON.parse(data) as { type?: unknown; html?: unknown; origin?: unknown }
      if (payload.type === 'mycourses' && typeof payload.html === 'string') {
        const origin = typeof payload.origin === 'string' ? payload.origin : 'https://letus.ed.tus.ac.jp'
        observeDashboard(scanAccRef.current, {
          html: payload.html,
          courseAnchorCount: parseMyCourses(payload.html, origin).length,
          knownCourseCount: prevKnownCountRef.current,
        })
      }
    } catch {
      // JSON でない/想定外ペイロードは診断対象外（既存の収集判定に委ねる）
    }
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
        <CourseUpdateEngine
          onProgress={onProgress}
          onFinished={() => setStage('assignments')}
          onCourseDiag={(obs) => observeCoursePage(scanAccRef.current, obs)}
        />
      ) : null}
      {stage === 'assignments' ? (
        <AssignmentCollector
          onProgress={(d, t) => onProgress?.(`課題を取り込んでいます… ${d}/${t}`)}
          onFinished={finish}
          onActivityDiag={(obs) => observeActivityPage(scanAccRef.current, obs)}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { height: 1, opacity: 0 },
  webview: { height: 1, opacity: 0 },
})
