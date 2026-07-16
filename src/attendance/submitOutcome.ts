import type { SubmitResult } from './engine'

/**
 * 出席送信の結果判定（純粋）。
 *
 * 旧実装は「ok でも wrong でも err でもない＝送信はしたが検出未確定」とみなして無期限に
 * 「確認しています」を出し続けていた。しかし actuator は **送信できなかった場合も**
 * ok/wrong/err を全て false で返す（例: 「出席登録する」ボタンが見つからない＝btnFound:false、
 * 公開スタブ、送信が発火しない）。その結果、CLASSに登録されていないのに永久に確認中のまま
 * ユーザーが放置される実バグが起きた（2026-07-16報告）。
 *
 * ここでは次の順で確定させる:
 * - CLASSが出席済みを示したら ok（actuatorのテキスト検出が外れていても、CLASSの状態が正）
 * - コード誤り/エラー、または送信ボタン未検出（＝そもそも送信されていない）は failed
 * - 確認窓（VERIFY_TIMEOUT_MS）を超えても出席済みにならなければ failed（無期限に回さない）
 */
export type SubmitOutcome = 'none' | 'ok' | 'failed' | 'verifying'

/**
 * 送信後、CLASSの出席済みマーカー(.attendSuc)を待つ上限。
 * エンジンは送信後 2.5秒 と 6秒 に出席ページを取り直すため、その両方＋余裕を含む長さにする。
 */
export const VERIFY_TIMEOUT_MS = 12000

export function submitOutcome(opts: {
  result: SubmitResult | null
  /** CLASSが出席済みを示しているか（受付状態 attended / 本日の出席記録）。 */
  attended: boolean
  /** 送信からの経過ミリ秒。 */
  elapsedMs: number
}): SubmitOutcome {
  const { result, attended, elapsedMs } = opts
  if (!result) return 'none'
  // CLASSの状態が正。actuatorの応答テキスト検出が外れていても出席済みなら成功。
  if (result.ok || attended) return 'ok'
  if (result.wrong || result.err) return 'failed'
  // 送信ボタンが無い＝JSFへ送信されていない。待っても出席済みにはならないので即失敗。
  if (result.btnFound === false) return 'failed'
  if (elapsedMs >= VERIFY_TIMEOUT_MS) return 'failed'
  return 'verifying'
}
