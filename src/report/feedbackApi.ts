import { buildFeedbackRequestBody, type FeedbackEnvelope } from './feedback'
import { FEEDBACK_ENDPOINT } from '../config/endpoints'

export { FEEDBACK_ENDPOINT }
const TIMEOUT_MS = 8000

/**
 * letus-apiへフィードバックを送信する。自宅鯖の可用性は本番クラウドほど読めないため、
 * 失敗理由の詳細はユーザーへ開示せず`{ok:false}`のみ返す（呼び出し側がmailto/コピーへ
 * フォールバックする）。
 * 送信先が未設定（`EXPO_PUBLIC_FEEDBACK_URL` 無し）なら通信せず `{ok:false}`。
 */
export async function submitFeedback(
  envelope: FeedbackEnvelope,
  endpoint: string | null = FEEDBACK_ENDPOINT,
): Promise<{ ok: true } | { ok: false }> {
  if (endpoint === null) return { ok: false }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildFeedbackRequestBody(envelope)),
      signal: controller.signal,
    })
    return res.ok ? { ok: true } : { ok: false }
  } catch {
    return { ok: false }
  } finally {
    clearTimeout(timer)
  }
}
