/**
 * kill switch status.json の取得（fetch注入可・vitestで検証）。
 * 失敗（非2xx・例外・タイムアウト・パース不能）はすべて null を返し、呼び出し側が
 * 直近キャッシュ維持（fail-open）を選ぶ。配信側は Cache-Control: no-store（waiteu-dev の _headers）。
 */
import { parseKillSwitchStatus, type KillSwitchStatus } from './killSwitch'

export const KILL_SWITCH_URL = 'https://waiteu.dev/litus/status.json'

// 起動・復帰の裏で走るだけなので短めに諦める（UIをブロックしない）。
const FETCH_TIMEOUT_MS = 8000

export async function fetchKillSwitchStatus(
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<KillSwitchStatus | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(KILL_SWITCH_URL, {
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' },
    })
    if (!res.ok) return null
    return parseKillSwitchStatus(await res.text())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
