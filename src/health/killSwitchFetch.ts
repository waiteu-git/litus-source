/**
 * kill switch status.json の取得（fetch注入可・vitestで検証）。
 * 失敗（非2xx・例外・タイムアウト・パース不能）はすべて null を返し、呼び出し側が
 * 直近キャッシュ維持（fail-open）を選ぶ。配信側は Cache-Control: no-store（waiteu-dev の _headers）。
 *
 * 宛先は `src/config/endpoints.ts`（環境変数 `EXPO_PUBLIC_KILLSWITCH_URL`）。**未設定は「失敗」ではなく
 * 「キルスイッチが無い」**: 通信せず null を返し、KillSwitchProvider はキャッシュも読まない
 * （`KILL_SWITCH_ENABLED`）。失敗時の「直近キャッシュ維持」と混ぜると、別の設定で焼いた停止キャッシュが残りうる。
 */
import { parseKillSwitchStatus, type KillSwitchStatus } from './killSwitch'
import { KILL_SWITCH_URL } from '../config/endpoints'

export { KILL_SWITCH_URL }

/** このビルドにキルスイッチがあるか（宛先が設定されているか）。 */
export const KILL_SWITCH_ENABLED: boolean = KILL_SWITCH_URL !== null

// 起動・復帰の裏で走るだけなので短めに諦める（UIをブロックしない）。
const FETCH_TIMEOUT_MS = 8000

export async function fetchKillSwitchStatus(
  build: number | null,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = FETCH_TIMEOUT_MS,
  url: string | null = KILL_SWITCH_URL,
): Promise<KillSwitchStatus | null> {
  if (url === null) return null // 未設定＝キルスイッチが無い。通信しない。
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' },
    })
    if (!res.ok) return null
    return parseKillSwitchStatus(await res.text(), build)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
