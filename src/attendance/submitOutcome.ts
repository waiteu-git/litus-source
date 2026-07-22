import type { AttendanceStatus } from '../collect/attendanceMessage'
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
 * - **受付中の授業が無い（status==='none'）なら failed**。出席が成立する余地が無い状態であり、
 *   actuator の文言一致（result.ok）より強い。2026-07-22の実機ログで、受付なしの画面なのに
 *   ok=true が返り「出席を登録しました」と緑チェックを見せていた（＝学生が確認せず欠席しうる）。
 *   result.ok がなぜ立ったかは未特定（okBy を仕込んで次の再現で確定させる）が、原因が分からずとも
 *   この否定シグナルで誤報だけは止まる。
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
  /**
   * 送信後にCLASSから読み直した受付状態。'none'（受付中の授業なし）は
   * 「登録されたはずがない」ことの確定シグナルとして result.ok より優先する。
   * 未取得（旧呼び出し）は undefined＝従来どおり。
   */
  receptionStatus?: AttendanceStatus | null
}): SubmitOutcome {
  const { result, attended, elapsedMs, receptionStatus } = opts
  if (!result) return 'none'
  // CLASSの状態が正。actuatorの応答テキスト検出が外れていても出席済みなら成功。
  if (attended) return 'ok'
  // 受付が無い＝出席は成立していない。文言一致の成功(result.ok)をここで打ち消す。
  if (receptionStatus === 'none') return 'failed'
  if (result.ok) return 'ok'
  if (result.wrong || result.err) return 'failed'
  // 送信ボタンが無い＝JSFへ送信されていない。待っても出席済みにはならないので即失敗。
  if (result.btnFound === false) return 'failed'
  if (elapsedMs >= VERIFY_TIMEOUT_MS) return 'failed'
  return 'verifying'
}

/**
 * 失敗カードに出す文言。
 *
 * actuator の result をそのまま出すと、受付なしガードで failed にしたときに赤枠へ
 * 「出席登録しました」と表示され、判定と文言が矛盾する（公開スタブや旧actuatorでは
 * result 側にガードが無いため必ず起きる）。ガードが効いたケースだけ理由を差し替える。
 */
export function submitFailureText(opts: {
  result: SubmitResult | null
  receptionStatus?: AttendanceStatus | null
}): string {
  const { result, receptionStatus } = opts
  if (receptionStatus === 'none' && result?.ok) return '出席確認中の授業がありません（登録されていません）'
  return result?.result ?? '送信できませんでした'
}
