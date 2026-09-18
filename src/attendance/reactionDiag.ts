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

/** 提出中に通ったページの記録の上限（診断の1行を長くしすぎない）。 */
export const REACTION_TRAIL_MAX = 6

/**
 * 提出中に非表示WebViewが通ったページを1つ足す（純粋）。`portal:Xua00102` のように
 * ページ種別と画面ID（URL のファイル名部分だけ）を残す。クエリや本文は残さない。
 * 同じものが続いたら畳む。上限を超えた分は捨てて、最後に `…` を1つだけ付ける。
 *
 * 失敗した時に「②へ着いてから戻された」のか「②が一度も来なかった」のかを記録で見分けるためのもの
 * （2026-09-11 の実機報告は「提出フォームが見つからない・②待ち8回」しか残っておらず、どちらか分からなかった）。
 */
export function appendReactionTrail(trail: readonly string[], kind: string, url?: string): string[] {
  const id = /\/([A-Za-z]{3}\d{5})\.xhtml/.exec(url ?? '')?.[1]
  const step = id ? `${kind}:${id}` : kind
  if (trail[trail.length - 1] === step) return [...trail]
  if (trail.length >= REACTION_TRAIL_MAX) return trail[trail.length - 1] === '…' ? [...trail] : [...trail, '…']
  return [...trail, step]
}

/** 診断の補足欄（②待ちの回数と、提出中に通ったページ）。どちらも無ければ undefined（純粋）。 */
export function formatReactionNote(fillTries: number, trail: readonly string[]): string | undefined {
  const parts = [
    fillTries > 0 ? `②待ち${fillTries}回` : null,
    trail.length > 0 ? `遷移=${trail.join('>')}` : null,
  ].filter((x): x is string => x !== null)
  return parts.length > 0 ? parts.join('・') : undefined
}

/** 通常の補足欄と、訂正時などの追加メモを結合する（純粋）。両方無ければ undefined。 */
export function joinReactionNote(base: string | undefined, extra: string | undefined): string | undefined {
  const parts = [base, extra].filter((x): x is string => !!x)
  return parts.length > 0 ? parts.join('・') : undefined
}

/**
 * 経路A（初回の任意提出）の訂正条件（純粋）。バックグラウンド復帰で確認タイマーが早まり
 * 「unconfirmed」で確定した後、汎用の出席状態検知が同じ科目の「提出済み」を後から拾った時に真になる。
 * 必須フローの成功確定は別経路（attended分岐）が担うため対象外。
 * 再提出も対象外: `reactionSubmitted`はCLASS側の「提出済み」フラグで、再提出では編集前から
 * 既に真＝この編集自体がCLASSへ届いたかを検証できない。その検証は`shouldReconcileResubmit`
 * （ajax受理という、その提出固有の証拠）の役割。
 */
export function shouldReconcileFirstSubmit(input: {
  lastFailOutcome: ReactionOutcome | null
  busy: boolean
  required: boolean
  courseNameMatches: boolean
  reactionSubmitted: boolean
  resubmit: boolean
}): boolean {
  return (
    input.lastFailOutcome === 'unconfirmed' &&
    !input.busy &&
    !input.required &&
    input.courseNameMatches &&
    input.reactionSubmitted &&
    !input.resubmit
  )
}

/**
 * 経路B（再提出）の訂正条件（純粋）。再提出はCLASS側の「提出済み」フラグが変化しないため、
 * 唯一の確定点は提出ajaxの受理そのもの（fillOk）。busy解除後に遅れて届いたfillメッセージを
 * 救済する呼び出し側と組み合わせて使う。
 *
 * 必須フローは対象外（経路Aの`!input.required`と同じ理由）: この codebase 自身の`doneNow()`が、
 * 必須フローの成功を`.attendSuc`（`receptionStatusRef.current === 'attended'`）でしか認めていない。
 * ajax受理はその条件を満たさない＝必須提出では「ajax受理された」だけでは学生が実際に出席扱いに
 * なっている保証がない。ここで訂正してしまうと、確認できていない必須提出の警告を誤って消し、
 * 学生に「大丈夫」と誤解させる（このアプリで避けるべき害の方向）。
 */
export function shouldReconcileResubmit(input: {
  lastFailOutcome: ReactionOutcome | null
  courseNameMatches: boolean
  fillOk: boolean
  required: boolean
}): boolean {
  return input.lastFailOutcome === 'unconfirmed' && input.courseNameMatches && input.fillOk && !input.required
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
