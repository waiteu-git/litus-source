// Discord webhook 通知。common.sh の払い出しを踏襲（1900字トリム・失敗しても落とさない）。
export function buildPayload(msg) {
  return { content: String(msg).slice(0, 1900) }
}

export async function notifyDiscord(url, msg) {
  console.log('[notify]', msg)
  if (!url) return
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(msg)),
    })
  } catch (e) {
    console.error('[notify] failed', e.message)
  }
}
