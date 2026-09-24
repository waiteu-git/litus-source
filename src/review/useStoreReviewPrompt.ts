/**
 * アプリ内ストア評価依頼（F）のトリガ。**ホーム画面だけが1回呼ぶ**（reviewWiring.test.ts が固定している）。
 * 設計: docs/design/2026-09-24-F-store-review-prompt.md §4.5・§10
 *
 * - 観測: ホームが前面のあいだ、初回・価値のあった日・失敗を保存状態へ取り込む（依頼の待ちとは切り離す）。
 * - 評価: ホームが前面で、否決信号が変わらないまま10秒たった時に1回だけ、ゲートを通して依頼する。
 *   信号が変わればタイマーを張り直す（収集が終わった後に、10秒静かならそこで評価できる）。
 *   否決信号は評価の時点で読み直す＝早く取った値を使わない。
 * - 通れば ①状態に記録 ②OS の依頼、の順（requestStoreReview が記録できなければ依頼しない）。
 *   OS の可否確認を待つ間に信号が変わりうるので、記録の直前にもう一度ゲートを通す。
 *   評価の途中でこの effect が片付けられた（フォーカス・前面・信号の変化・アンマウント）時は依頼しない。
 * - この起動（プロセス）では、依頼を試みたら1回きり。出た・出ない・失敗のいずれでも再試行しない
 *   （直前の確認で中止した時だけ、何も起きていないので次の機会に回す）。
 * - ボタン等の操作からは呼ばない・質問や独自ダイアログを出さない（Apple・Google の禁止事項）。
 * - foregroundPulse は使わない・動かさない（初回の起動では発火しない・同期の段階発火の表を共有するため）。
 */
import { useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useAttendanceEngine } from '../attendance/AttendanceEngineProvider'
import type { ClassActivePredicate } from '../attendance/homeBanner'
import type { TimetableCollection } from '../collect/timetableMessage'
import { useDemo } from '../demo/DemoProvider'
import { evaluateAccess } from '../health/accessGate'
import { APP_BUILD } from '../health/appBuild'
import { isOnlineNow, useConnectivity } from '../health/connectivity'
import { useDiagnostics } from '../health/DiagnosticsProvider'
import { buildBannerContent } from '../health/diagnosticsBannerContent'
import { useKillSwitch } from '../health/KillSwitchProvider'
import { RELEASE_STAGE } from '../releaseStage'
import { loadCollectionHealth } from '../storage/collectionHealthStore'
import { mutateReviewState, type LoadedReviewState } from '../storage/reviewStateStore'
import { loadSubmitDiags } from '../storage/submitDiagStore'
import { useSync } from '../sync/SyncProvider'
import { requestStoreReview } from './requestStoreReview'
import { REVIEW_FORCE } from './reviewForce'
import { SETTLE_MS, decideReview, type ReviewGateInput } from './reviewGate'
import { addValueDay, localDayKey, mergeFailure, recordRequest } from './reviewState'
import {
  failureAtFromHealth,
  failureAtFromSubmitDiags,
  hadValueToday,
  latestFailureAt,
  nearClassPeriod,
  reviewKillStatus,
  type ReviewKillStatus,
} from './reviewSignals'

/** setTimeout の誤差で10秒にわずかに届かず、ゲートが not_settled で黙って否決するのを避ける余白。 */
const TIMER_MARGIN_MS = 250

/** この起動（プロセス）で依頼を試みたか。モジュールスコープ＝画面の作り直しでは戻らない。 */
let attemptedThisSession = false

type Signals = {
  demo: boolean
  killStatus: ReviewKillStatus
  diagnosticsBanner: boolean
  attendanceRunning: boolean
  timetable: TimetableCollection[]
  courseActive: ClassActivePredicate
  syncBusy: boolean
  homeFocused: boolean
  appActive: boolean
  lastAssignmentsAt: number
  lastBulletinAt: number
}

/** 初回・価値のあった日・失敗を状態へ取り込み、最新の状態を返す。 */
async function observe(now: number, valueToday: boolean): Promise<LoadedReviewState> {
  return mutateReviewState(now, async (state) => {
    let next = state
    if (next.firstSeenAt === null) next = { ...next, firstSeenAt: now }
    if (valueToday) next = addValueDay(next, localDayKey(now))
    const [diags, health] = await Promise.all([loadSubmitDiags(), loadCollectionHealth()])
    const failedAt = latestFailureAt(failureAtFromSubmitDiags(diags), failureAtFromHealth(health))
    // 端末の時計が進んでいた間の失敗時刻が未来のまま残ると、待ちが時計のずれの分だけ終わらない。
    if (failedAt !== null) next = mergeFailure(next, Math.min(failedAt, now))
    return next
  })
}

/**
 * @param courseActive 科目にまだ授業が残っているかの述語。ホームが持っているものを渡す
 *   （同じ読み込みをここでもう一度しない・授業の余白の判定をホームの表示と揃える）。
 */
export function useStoreReviewPrompt(courseActive: ClassActivePredicate): void {
  const homeFocused = useIsFocused()
  const [appActive, setAppActive] = useState(AppState.currentState === 'active')
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'))
    // 初期値を読んでから購読するまでの間に変わった分を取りこぼさない。
    setAppActive(AppState.currentState === 'active')
    return () => sub.remove()
  }, [])

  const { active: demo } = useDemo()
  const { status } = useKillSwitch()
  const { state: diagnostics } = useDiagnostics()
  const { running: attendanceRunning, timetable } = useAttendanceEngine()
  const { bulletinBusy, assignmentBusy, attendanceStatsBusy, lastAssignmentsAt, lastBulletinAt } = useSync()
  const isOnline = useConnectivity()

  const enabled = !demo && (RELEASE_STAGE === 'production' || REVIEW_FORCE)
  const killStatus = reviewKillStatus(status)
  const diagnosticsBanner = buildBannerContent(diagnostics).kind !== 'none'
  const syncBusy = bulletinBusy || assignmentBusy || attendanceStatsBusy

  // タイマーが発火した時点の最新の値を読むための参照。描画のたびに差し替える。
  const latest = useRef<Signals | null>(null)
  latest.current = {
    demo,
    killStatus,
    diagnosticsBanner,
    attendanceRunning,
    timetable,
    courseActive,
    syncBusy,
    homeFocused,
    appActive,
    lastAssignmentsAt,
    lastBulletinAt,
  }
  const quietSince = useRef(0)
  const evaluating = useRef(false)

  // 観測: ホームが前面になった時と、課題・掲示の同期時刻が変わった時。10秒の待ちとは切り離す。
  useEffect(() => {
    if (!enabled || !homeFocused || !appActive) return
    const now = Date.now()
    observe(now, hadValueToday(now, [lastAssignmentsAt, lastBulletinAt])).catch(() => undefined)
  }, [enabled, homeFocused, appActive, lastAssignmentsAt, lastBulletinAt])

  // 評価: 否決信号が変わらないまま静かな時間が続いたら1回だけ。信号が変われば張り直す。
  const quietKey = [killStatus, diagnosticsBanner, attendanceRunning, syncBusy, isOnline].join('|')
  useEffect(() => {
    if (!enabled || !homeFocused || !appActive || attemptedThisSession) return
    quietSince.current = Date.now()
    // この effect が片付けられたら（フォーカス・前面・信号の変化・アンマウント）、途中の評価は依頼しない。
    let cancelled = false

    function gateInput(now: number, loaded: LoadedReviewState, sessionRequested: boolean): ReviewGateInput {
      const s = latest.current!
      const access = [
        evaluateAccess('class', { now: new Date(now), isOnline: isOnlineNow() }),
        evaluateAccess('letus', { now: new Date(now), isOnline: isOnlineNow() }),
      ]
      return {
        now,
        stage: RELEASE_STAGE,
        force: REVIEW_FORCE,
        demo: s.demo,
        killStatus: s.killStatus,
        diagnosticsBanner: s.diagnosticsBanner,
        maintenance: access.some((a) => a.reason === 'maintenance'),
        offline: access.some((a) => a.reason === 'offline'),
        attendanceRunning: s.attendanceRunning,
        nearClass: nearClassPeriod(s.timetable, new Date(now), s.courseActive),
        syncBusy: s.syncBusy,
        homeFocused: s.homeFocused,
        appActive: s.appActive && AppState.currentState === 'active',
        settledMs: now - quietSince.current,
        sessionRequested,
        buildNumber: APP_BUILD,
        state: loaded.state,
        stateHealth: loaded.health,
      }
    }

    async function evaluate() {
      if (evaluating.current || attemptedThisSession) return
      evaluating.current = true
      try {
        const t0 = Date.now()
        const s0 = latest.current!
        const loaded = await observe(t0, hadValueToday(t0, [s0.lastAssignmentsAt, s0.lastBulletinAt]))
        if (cancelled) return

        // 保存の読み書きを待つ間に信号が変わりうるので、判定の直前に読み直す。
        if (!decideReview(gateInput(Date.now(), loaded, attemptedThisSession)).ok) return

        attemptedThisSession = true
        const outcome = await requestStoreReview(async () => {
          if (cancelled || AppState.currentState !== 'active') return false
          // OS の可否確認（isAvailableAsync）を待つ間にも信号が変わりうる＝記録の直前にもう一度通す。
          // この試み自体は既に数えてあるので、sessionRequested は偽で見る。
          const n2 = Date.now()
          if (!decideReview(gateInput(n2, loaded, false)).ok) return false
          await mutateReviewState(n2, (st) => recordRequest(st, n2, APP_BUILD))
          return true
        })
        // 中止（何も出さず・何も記録していない）は試みに数えない。出た・出せない・失敗は1回で終わり。
        if (outcome === 'aborted') attemptedThisSession = false
      } catch {
        // 保存・読み込みの失敗は、その評価を見送るだけ（出さない側へ倒す）。
      } finally {
        evaluating.current = false
      }
    }

    const timer = setTimeout(evaluate, SETTLE_MS + TIMER_MARGIN_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [enabled, homeFocused, appActive, quietKey])
}
