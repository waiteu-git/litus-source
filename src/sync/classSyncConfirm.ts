import type { AccessDecision } from '../health/accessGate'
import { syncSkipReason, type SyncSkipReason } from '../health/syncSkipNotice'

/**
 * CLASS同期（掲示・時間割）の実行可否を、授業中の「確認して回す（override）」まで含めて判定する（純粋）。
 *
 * - 判定基準は既存の syncSkipReason を単一の真実として再利用する（新しいゲートを増やさない）。
 * - 授業中(attending)でも **出席タブが前面でなければ** override で回せる（classViewArbiter が
 *   収集にCLASSを明け渡し、出席WebViewを一時アンマウントするため安全＝直列化される）。
 * - 出席タブが前面(attendanceFocused)のあいだは据え置き（blocked・確認を出さない）＝出席画面を壊さない。
 * - offline / maintenance は override 不可の hard block（通信不許可・メンテ帯では回しても失敗する）。
 */
export type ClassSyncDecision =
  | { kind: 'run' }
  | { kind: 'blocked'; reason: SyncSkipReason }
  | { kind: 'confirm' }

export function decideClassSync(opts: {
  access: AccessDecision
  running: boolean
  attendanceFocused: boolean
  override?: boolean
}): ClassSyncDecision {
  const reason = syncSkipReason({ access: opts.access, running: opts.running })
  if (reason == null) return { kind: 'run' }
  // offline / maintenance は override 不可。
  if (reason !== 'attending') return { kind: 'blocked', reason }
  // 授業中: 出席タブ表示中は据え置き（確認しない）。
  if (opts.attendanceFocused) return { kind: 'blocked', reason: 'attending' }
  // 出席タブ非表示なら override で回せる。未 override は確認を求める。
  return opts.override ? { kind: 'run' } : { kind: 'confirm' }
}
