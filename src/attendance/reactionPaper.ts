/**
 * リアクションペーパー提出の純粋ロジック（React Native非依存・vitest対象）。
 *
 * 文字数制限はCLASS実測（②フォームのラベル）: 「600文字以内」「※全角文字は2文字として扱われます。」
 * サーバ側の正確な換算（半角カナ等の扱い）は未確定のため、ASCII以外はすべて2文字と数える
 * **安全側の近似**にする（過大に数えて早めにブロックする分には提出が拒否されるより良い）。
 */

export const REACTION_MAX_LEN = 600

/** CLASS換算の文字数: ASCII（コードポイント<=0x7F）=1、それ以外=2。コードポイント単位で数える。 */
export function reactionLength(text: string): number {
  let n = 0
  for (const ch of text) n += (ch.codePointAt(0) ?? 0) <= 0x7f ? 1 : 2
  return n
}

/** 提出可能か: 空白のみでなく、換算600文字以内。 */
export function canSubmitReaction(text: string): boolean {
  return text.trim().length > 0 && reactionLength(text) <= REACTION_MAX_LEN
}

/** アプリ内で書いた本文の下書き（提出確定＝出席済み検知まで保全する）。 */
export type ReactionDraft = {
  /** 記録した日（YYYY-MM-DD・ローカル）。日付が変われば無効。 */
  date: string
  /** 対象科目名（受付状況から取得。取れないことがあるため null 許容）。 */
  courseName: string | null
  text: string
}

/**
 * 下書きを現在のリアペ待ち授業へ復元してよいか。
 * 同日でないなら不可（古い本文の誤提出防止）。科目名は双方取れているときだけ照合し、
 * どちらかが不明なら同日中は適用する（安全側=書いた本文を消さない）。
 */
export function reactionDraftApplies(
  draft: ReactionDraft,
  today: string,
  courseName: string | null,
): boolean {
  if (!draft.text) return false
  if (draft.date !== today) return false
  if (draft.courseName != null && courseName != null && draft.courseName !== courseName) return false
  return true
}

/**
 * ②フォームの出現を待つポーリング設定（①→②はPrimeFacesの `u:"@all"`＝ページ全体の再描画で、
 * 回線・端末しだいで数秒かかる）。
 *
 * v98 までは「1800ms待って1回だけ再試行」＝**約3.6秒で諦める**固定タイマだった。授業中の混雑した
 * 学内Wi-Fiでは②の描画がこれを超え、`form-missing` で失敗する（2026-07-20 実機報告の最有力原因。
 * 実DOMに対する probe では遷移・流し込み・提出ボタン発火のすべてが成功したため、DOM構造ではなく
 * タイミングが疑わしいと確定した）。収集エンジンで既に学んだ「固定タイマではなく着地駆動」と同じ形へ寄せる。
 */
export const REACTION_FILL_RETRY_MS = 600
/** 再試行の上限（600ms × 8 ≒ 4.8秒ぶん待てる。初回1800msと合わせて約6.6秒＝全体20秒の保険内）。 */
export const REACTION_FILL_MAX_TRIES = 8
