import { buildFeedbackRequestBody, type FeedbackEnvelope } from './feedback'

const FEEDBACK_ENDPOINT = 'https://api.waiteu.dev/api/feedback'
const TIMEOUT_MS = 8000

/**
 * letus-apiへフィードバックを送信する。自宅鯖の可用性は本番クラウドほど読めないため、
 * 失敗理由の詳細はユーザーへ開示せず`{ok:false}`のみ返す（呼び出し側がmailto/コピーへ
 * フォールバックする）。
 */
export async function submitFeedback(envelope: FeedbackEnvelope): Promise<{ ok: true } | { ok: false }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(FEEDBACK_ENDPOINT, {
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
