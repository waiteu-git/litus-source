import type { SubmitDiag } from './submitDiag'

/**
 * リアクションペーパー提出の診断記録（純粋・RN非依存）。
 *
 * 背景（2026-07-20 ベータ報告）: 法学（リアペ必須）で「入力画面までは行けたが、送信しようとすると
 * エラー」。v98 の修正で画面到達は直った（出席コードは status=200 で受理され、CLASSは
 * 「出席登録は完了していません／リアクションペーパーを提出してください」を返していた）が、
 * **提出そのものが失敗**した。ところが当時アプリは提出の失敗を**どこにも記録していなかった**
 * （addSubmitDiag は出席コード送信の経路にしか無かった）ため、テスターが画面を撮り忘れた時点で
 * 証拠が消えた。さらに失敗理由 5 種が UI 上 3 つの文言へ畳まれており、区別もできなかった。
 *
 * 出席送信で確立した「理由を握り潰さず端末に貯める」を、そのままリアペ提出へ横展開する。
 * 記録先は出席送信と同じ「出席送信の記録」（設定画面）＝ユーザーは1箇所を見ればよく、
 * テスターへの依頼も従来どおり「記録を見せてください」で済む。
 *
 * **本文そのものは記録しない**（リアペは個人の記述内容。診断に必要なのは長さだけ）。
 */

/** 提出フローの終端。ok 以外はすべて失敗（原因が区別できることが要件）。 */
export type ReactionOutcome =
  | 'ok'
  /** ②フォームが見つからない（描画待ちの再試行後も不在）。 */
  | 'form-missing'
  /** 流し込んだ本文の読み戻し検証に失敗（入っていない）。 */
  | 'verify-failed'
  /** 「提出」ボタンが見つからない（ラベル変更・別レイアウトの疑い）。 */
  | 'button-missing'
  /** actuator がスタブのビルド（公開クローン等）。 */
  | 'stub'
  /** 提出画面での例外。 */
  | 'error'
  /** ①カードからリアペ画面へ遷移できなかった。 */
  | 'open-failed'
  /** 提出は発火したが、確定マーカーを確認できなかった（11秒）。 */
  | 'unconfirmed'

export function reactionFailLabel(o: ReactionOutcome): string {
  switch (o) {
    case 'ok':
      return '提出しました'
    case 'form-missing':
      return '提出フォームが見つからない'
    case 'verify-failed':
      return '本文の流し込みを確認できない'
    case 'button-missing':
      return '提出ボタンが見つからない'
    case 'stub':
      return 'このビルドでは提出できない'
    case 'error':
      return '提出画面でエラー'
    case 'open-failed':
      return 'リアペ画面を開けない'
    case 'unconfirmed':
      return '提出したが結果を確認できない'
  }
}

export type ReactionDiagInput = {
  outcome: ReactionOutcome
  /** 必須（出さないと出席にならない）か、任意提出か。失敗の意味が変わるので残す。 */
  required: boolean
  /** 既に提出済みの本文を編集した再提出か。確定マーカーが違うので残す。 */
  resubmit: boolean
  /** 本文の長さ（内容は記録しない）。 */
  length: number
  ajaxDone?: boolean
  ajaxStatus?: number
  ajaxError?: string
  /** サーバ側の検証失敗（200 + validationFailed）。 */
  ajaxInvalid?: boolean
  /** サーバ側の例外（200 + partial-response の `<error>`）。 */
  ajaxServerError?: string
}

/** リアペ提出の診断を、出席送信と同じ器（SubmitDiag）へ変換する（純粋・nowIso は注入）。 */
export function toReactionDiag(
  r: ReactionDiagInput,
  ctx: { nowIso: string; courseName: string | null; note?: string },
): SubmitDiag {
  const kindNote = `${r.required ? '必須' : '任意'}${r.resubmit ? '・再提出' : ''}`
  return {
    kind: 'reaction',
    at: ctx.nowIso,
    courseName: ctx.courseName,
    note: ctx.note ? `${kindNote}・${ctx.note}` : kindNote,
    ok: r.outcome === 'ok',
    wrong: false,
    err: r.outcome !== 'ok' && r.outcome !== 'unconfirmed',
    result: reactionFailLabel(r.outcome),
    // 本文の長さのみ（内容は持たない）。出席送信の「入力桁数」と同じ枠を使う。
    filled: r.length,
    ajaxDone: r.ajaxDone,
    ajaxStatus: r.ajaxStatus,
    ajaxError: r.ajaxError,
    ajaxInvalid: r.ajaxInvalid,
    ajaxServerError: r.ajaxServerError,
  }
}
