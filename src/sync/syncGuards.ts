/**
 * 統合同期（掲示→課題）の実行可否プラン（純粋・RN非依存）。
 * 掲示(CLASS)は出席WebViewとのセッション競合を避けるため授業中(running)をスキップ理由に含める。
 * 課題(LETUS)は出席セッションと無関係なので running を渡さない（attending は発生しない）。
 * ゲート判定は既存の evaluateAccess + syncSkipReason に委譲し、判定基準を増やさない。
 */
import { evaluateAccess } from '../health/accessGate'
import { syncSkipReason, type SyncSkipReason } from '../health/syncSkipNotice'

export type SyncPlanInput = { now: Date; isOnline: boolean; running: boolean }
/** 'run' なら開始してよい。それ以外はスキップ理由。 */
export type SyncPlan = { bulletin: 'run' | SyncSkipReason; letus: 'run' | SyncSkipReason }

export function planSync(input: SyncPlanInput): SyncPlan {
  const bulletin = syncSkipReason({
    access: evaluateAccess('class', { now: input.now, isOnline: input.isOnline }),
    running: input.running,
  })
  const letus = syncSkipReason({
    access: evaluateAccess('letus', { now: input.now, isOnline: input.isOnline }),
  })
  return { bulletin: bulletin ?? 'run', letus: letus ?? 'run' }
}
