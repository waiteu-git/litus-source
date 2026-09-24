/**
 * アプリ内ストア評価依頼（F）を「今出してよいか」の純粋なゲート（RN非依存・vitest対象）。
 * 設計: docs/design/2026-09-24-F-store-review-prompt.md §4.1・§10
 *
 * 上から順に評価し、最初の否決で止まる（順序は reviewGate.test.ts が全組み合わせで固定している）。
 * 入力は呼び出し側（useStoreReviewPrompt）が評価の時点で読み直した値。ここは何も読まない・保存しない。
 */
import type { ReleaseStage } from '../releaseStage'
import { DAY_MS, type ReviewState, type ReviewStateHealth } from './reviewState'
import type { ReviewKillStatus } from './reviewSignals'

/** 前面で、否決信号が変わらないまま静かなこの時間が続いてから評価する。 */
export const SETTLE_MS = 10_000
export const MIN_DAYS_SINCE_FIRST_SEEN = 14
export const MIN_DAYS_SINCE_FAILURE = 7
export const MIN_VALUE_DAYS = 5
export const MIN_DAYS_BETWEEN_REQUESTS = 120
export const YEAR_DAYS = 365
/** OS 側の制限（iOS は365日で3回・Google は非公開）の内側でさらに絞る。 */
export const MAX_REQUESTS_PER_YEAR = 2

export type ReviewGateInput = {
  now: number
  stage: ReleaseStage
  /** 開発・ベータでの確認用。production では無視される。 */
  force: boolean
  demo: boolean
  killStatus: ReviewKillStatus
  /** 診断バナー（ログイン切れ・読み取り不調など）が出ている。 */
  diagnosticsBanner: boolean
  /** CLASS または LETUS のメンテナンス窓の中。 */
  maintenance: boolean
  offline: boolean
  /** 授業時限内・受付中・出席画面の表示中（出席エンジンが稼働している）。 */
  attendanceRunning: boolean
  /** 掲示・出欠・課題のいずれかの収集が動いている。 */
  syncBusy: boolean
  homeFocused: boolean
  appActive: boolean
  /** ホームが前面になってから、否決信号が変わらないまま経過した時間。 */
  settledMs: number
  /** この起動（プロセス）で既に依頼を試みた。 */
  sessionRequested: boolean
  buildNumber: number | null
  state: ReviewState
  stateHealth: ReviewStateHealth
}

export type ReviewVeto =
  | 'not_production'
  | 'demo'
  | 'status_unknown'
  | 'stopped'
  | 'notice'
  | 'diagnostics'
  | 'maintenance'
  | 'offline'
  | 'attendance'
  | 'sync_busy'
  | 'not_home'
  | 'app_inactive'
  | 'not_settled'
  | 'session_requested'
  | 'state_unreadable'
  | 'build_unknown'
  | 'too_new'
  | 'recent_failure'
  | 'few_value_days'
  | 'same_build'
  | 'recent_request'
  | 'yearly_limit'

export type ReviewDecision = { ok: true } | { ok: false; reason: ReviewVeto }

export function decideReview(i: ReviewGateInput): ReviewDecision {
  const no = (reason: ReviewVeto): ReviewDecision => ({ ok: false, reason })
  // production では force は何もしない（環境変数の付け間違いで出荷物が強制されない）。
  const forced = i.force && i.stage !== 'production'

  if (i.stage !== 'production' && !forced) return no('not_production')
  if (i.demo) return no('demo')
  if (i.killStatus === 'unknown') return no('status_unknown')
  if (i.killStatus === 'stopped') return no('stopped')
  if (i.killStatus === 'notice') return no('notice')
  if (i.diagnosticsBanner) return no('diagnostics')
  if (i.maintenance) return no('maintenance')
  if (i.offline) return no('offline')
  if (i.attendanceRunning) return no('attendance')
  if (i.syncBusy) return no('sync_busy')
  if (!i.homeFocused) return no('not_home')
  if (!i.appActive) return no('app_inactive')
  if (i.settledMs < SETTLE_MS) return no('not_settled')
  if (i.sessionRequested) return no('session_requested')
  if (i.stateHealth === 'corrupt') return no('state_unreadable')

  if (forced) return { ok: true }

  if (i.buildNumber === null) return no('build_unknown')

  const { firstSeenAt, lastFailureAt, valueDays, lastBuild, requests } = i.state
  if (firstSeenAt === null || i.now - firstSeenAt < MIN_DAYS_SINCE_FIRST_SEEN * DAY_MS) return no('too_new')
  if (lastFailureAt !== null && i.now - lastFailureAt < MIN_DAYS_SINCE_FAILURE * DAY_MS) return no('recent_failure')
  if (valueDays.length < MIN_VALUE_DAYS) return no('few_value_days')

  if (lastBuild === i.buildNumber) return no('same_build')
  const last = requests.length > 0 ? Math.max(...requests) : null
  if (last !== null && i.now - last < MIN_DAYS_BETWEEN_REQUESTS * DAY_MS) return no('recent_request')
  const inYear = requests.filter((t) => i.now - t < YEAR_DAYS * DAY_MS).length
  if (inYear >= MAX_REQUESTS_PER_YEAR) return no('yearly_limit')

  return { ok: true }
}
