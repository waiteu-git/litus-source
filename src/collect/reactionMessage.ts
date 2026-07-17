/**
 * リアペ提出フローの注入JS応答（postMessage type:'reaction'）を判定する純粋関数。
 * 注入JSは事実（開けた/流し込めた/何が無かった）だけを送り、フロー判断はRN側エンジンが行う。
 * - stage 'open': ①カードの「リアクションペーパー」ボタン押下（②フォームへのJSF postback遷移）
 * - stage 'fill': ②フォームへの本文流し込み＋「提出」発火（actuator・reactionSubmit.private）
 */

export type ReactionFillFailReason = 'form-missing' | 'verify-failed' | 'button-missing' | 'stub' | 'error'

export type ReactionScriptMessage =
  | { kind: 'open'; ok: boolean }
  | {
      kind: 'fill'
      ok: true
      reason: null
      /** 提出ajax(PrimeFaces.ab)の観測結果。**再提出の確定点**（提出済みフラグが変化しないため）。 */
      ajaxDone?: boolean
      ajaxStatus?: number
      ajaxError?: string
    }
  | { kind: 'fill'; ok: false; reason: ReactionFillFailReason }

const FILL_FAIL_REASONS: readonly ReactionFillFailReason[] = ['form-missing', 'verify-failed', 'button-missing', 'stub']

export function parseReactionMessage(raw: string): ReactionScriptMessage | null {
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as { type?: unknown; stage?: unknown; ok?: unknown; reason?: unknown }
  if (p.type !== 'reaction') return null
  if (p.stage === 'open') return { kind: 'open', ok: p.ok === true }
  if (p.stage === 'fill') {
    if (p.ok === true) {
      const q = payload as { ajaxDone?: unknown; ajaxStatus?: unknown; ajaxError?: unknown }
      return {
        kind: 'fill',
        ok: true,
        reason: null,
        ajaxDone: typeof q.ajaxDone === 'boolean' ? q.ajaxDone : undefined,
        ajaxStatus: typeof q.ajaxStatus === 'number' ? q.ajaxStatus : undefined,
        ajaxError: typeof q.ajaxError === 'string' && q.ajaxError ? q.ajaxError : undefined,
      }
    }
    const reason = FILL_FAIL_REASONS.find((r) => r === p.reason) ?? 'error'
    return { kind: 'fill', ok: false, reason }
  }
  return null
}
