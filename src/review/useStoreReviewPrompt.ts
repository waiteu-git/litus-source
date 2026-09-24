/**
 * アプリ内ストア評価依頼（F）のトリガ。**ホーム画面だけが1回呼ぶ**（reviewWiring.test.ts が固定している）。
 * 設計: docs/design/2026-09-24-F-store-review-prompt.md §4.5・§10
 *
 * - 観測: ホームが前面のあいだ、初回・価値のあった日・失敗を保存状態へ取り込む（依頼の待ちとは切り離す）。
 * - 評価: ホームが前面で、否決信号が変わらないまま10秒たった時に1回だけ、ゲートを通して依頼する。
 *   信号が変わればタイマーを張り直す（収集が終わった後に、10秒静かならそこで評価できる）。
 *   否決信号は評価の時点で読み直す＝早く取った値を使わない。
 * - 通れば ①状態に記録 ②OS の依頼、の順（requestStoreReview が記録できなければ依頼しない）。
 * - この起動（プロセス）では1回しか試みない。出た・出ない・失敗のいずれでも再試行しない。
 * - ボタン等の操作からは呼ばない・質問や独自ダイアログを出さない（Apple・Google の禁止事項）。
 * - foregroundPulse は使わない・動かさない（初回の起動では発火しない・同期の段階発火の表を共有するため）。
 */
import { useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useAttendanceEngine } from '../attendance/AttendanceEngineProvider'
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
    if (failedAt !== null) next = mergeFailure(next, failedAt)
    return next
  })
}

export function useStoreReviewPrompt(): void {
  const homeFocused = useIsFocused()
  const [appActive, setAppActive] = useState(AppState.currentState === 'active')
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'))
    return () => sub.remove()
  }, [])

  const { active: demo } = useDemo()
  const { status } = useKillSwitch()
  const { state: diagnostics } = useDiagnostics()
  const { running: attendanceRunning } = useAttendanceEngine()
  const { bulletinBusy, assignmentBusy, attendanceStatsBusy, lastAssignmentsAt, lastBulletinAt } = useSync()
  const isOnline = useConnectivity()

  const enabled = !demo && (RELEASE_STAGE === 'production' || REVIEW_FORCE)
  const killStatus = reviewKillStatus(status)
  const diagnosticsBanner = buildBannerContent(diagnostics).kind !== 'none'
  const syncBusy = bulletinBusy || assignmentBusy || attendanceStatsBusy

  // タイマーが発火した時点の最新の値を読むための参照。描画のたびに差し替える。
  const latest = useRef<Signals>({
    demo,
    killStatus,
    diagnosticsBanner,
    attendanceRunning,
    syncBusy,
    homeFocused,
    appActive,
    lastAssignmentsAt,
    lastBulletinAt,
  })
  latest.current = {
    demo,
    killStatus,
    diagnosticsBanner,
    attendanceRunning,
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

    async function evaluate() {
      if (evaluating.current || attemptedThisSession) return
      evaluating.current = true
      try {
        const t0 = Date.now()
        const s0 = latest.current
        const loaded = await observe(t0, hadValueToday(t0, [s0.lastAssignmentsAt, s0.lastBulletinAt]))

        // 保存の読み書きを待つ間に信号が変わりうるので、判定の直前に読み直す。
        const now = Date.now()
        const s = latest.current
        const access = [
          evaluateAccess('class', { now: new Date(now), isOnline: isOnlineNow() }),
          evaluateAccess('letus', { now: new Date(now), isOnline: isOnlineNow() }),
        ]
        const input: ReviewGateInput = {
          now,
          stage: RELEASE_STAGE,
          force: REVIEW_FORCE,
          demo: s.demo,
          killStatus: s.killStatus,
          diagnosticsBanner: s.diagnosticsBanner,
          maintenance: access.some((a) => a.reason === 'maintenance'),
          offline: access.some((a) => a.reason === 'offline'),
          attendanceRunning: s.attendanceRunning,
          syncBusy: s.syncBusy,
          homeFocused: s.homeFocused,
          appActive: s.appActive && AppState.currentState === 'active',
          settledMs: now - quietSince.current,
          sessionRequested: attemptedThisSession,
          buildNumber: APP_BUILD,
          state: loaded.state,
          stateHealth: loaded.health,
        }
        if (!decideReview(input).ok) return

        attemptedThisSession = true
        await requestStoreReview(async () => {
          if (AppState.currentState !== 'active' || !latest.current.homeFocused) return false
          await mutateReviewState(now, (st) => recordRequest(st, now, APP_BUILD))
          return true
        })
      } catch {
        // 保存・読み込みの失敗は、その評価を見送るだけ（出さない側へ倒す）。
      } finally {
        evaluating.current = false
      }
    }

    const timer = setTimeout(evaluate, SETTLE_MS + TIMER_MARGIN_MS)
    return () => clearTimeout(timer)
  }, [enabled, homeFocused, appActive, quietKey])
}
