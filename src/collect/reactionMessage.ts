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
      /**
       * サーバ側の検証が落ちたか（PrimeFaces は 200 + args.validationFailed で返す）。
       * status<400 だけを確定点にすると保存されていないのに「提出しました」になる。
       */
      ajaxInvalid?: boolean
      /**
       * サーバ側の例外（partial-response の `<error>`。ViewExpired 等）。これも **200 で来る**。
       * 空文字は「無し」。
       */
      ajaxServerError?: string
    }
  | { kind: 'fill'; ok: false; reason: ReactionFillFailReason }

const FILL_FAIL_REASONS: readonly ReactionFillFailReason[] = ['form-missing', 'verify-failed', 'button-missing', 'stub']

/**
 * 提出ajaxが「サーバに受理された」と言えるか。**再提出の唯一の確定点**なので厳しく判定する。
 *
 * HTTP 200 は保存を意味しない。JSF/PrimeFaces は
 *  ・サーバ側の検証失敗を 200 + `args.validationFailed`
 *  ・例外（ViewExpiredException 等）を 200 + partial-response の `<error>`
 * で返す。status だけを見ていた頃は、セッションが切れて何も保存されていなくても
 * 「提出しました」と表示していた（出席側で見つけた偽の成功と同型・2026-07-22）。
 */
export function reactionSubmitAccepted(m: {
  ajaxDone?: boolean
  ajaxStatus?: number
  ajaxError?: string
  ajaxInvalid?: boolean
  ajaxServerError?: string
}): boolean {
  if (m.ajaxDone !== true) return false
  // PrimeFaces は `.always()` で oncomplete を呼ぶ＝**通信断/中断でも ajaxDone は true になる**。
  // そのとき xhr.status は 0 なので「<400 だからOK」では素通りする（Wi-Fi切断や画面遷移で
  // XHRが中断した再提出が、届いていないのに成功になる）。2xx/3xx を積極的に要求する。
  if (m.ajaxError) return false
  if (typeof m.ajaxStatus !== 'number') return false
  if (m.ajaxStatus < 200 || m.ajaxStatus >= 400) return false
  if (m.ajaxInvalid === true) return false
  if (m.ajaxServerError) return false
  return true
}

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
      const q = payload as {
        ajaxDone?: unknown
        ajaxStatus?: unknown
        ajaxError?: unknown
        ajaxInvalid?: unknown
        ajaxServerError?: unknown
      }
      return {
        kind: 'fill',
        ok: true,
        reason: null,
        ajaxDone: typeof q.ajaxDone === 'boolean' ? q.ajaxDone : undefined,
        ajaxStatus: typeof q.ajaxStatus === 'number' ? q.ajaxStatus : undefined,
        ajaxError: typeof q.ajaxError === 'string' && q.ajaxError ? q.ajaxError : undefined,
        ajaxInvalid: typeof q.ajaxInvalid === 'boolean' ? q.ajaxInvalid : undefined,
        ajaxServerError:
          typeof q.ajaxServerError === 'string' && q.ajaxServerError ? q.ajaxServerError : undefined,
      }
    }
    const reason = FILL_FAIL_REASONS.find((r) => r === p.reason) ?? 'error'
    return { kind: 'fill', ok: false, reason }
  }
  return null
}
