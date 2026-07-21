import { Storage } from './asyncStorage'
import { createWriteQueue } from './writeQueue'
import {
  deserializeKillSwitchCache,
  serializeKillSwitchCache,
  type KillSwitchCache,
} from './killSwitchSerialize'

/**
 * kill switch status.json の直近取得値キャッシュ。書き込みは取得成功時のみ
 * （失敗時はfetchedAtを進めない＝次の復帰で再試行）。読めなければ null（=fail-open）。
 */
const KEY = 'killSwitch.cache.v1'

const enqueueWrite = createWriteQueue()

export async function loadKillSwitchCache(): Promise<KillSwitchCache | null> {
  return deserializeKillSwitchCache(await Storage.getItem(KEY))
}

export function saveKillSwitchCache(cache: KillSwitchCache): Promise<void> {
  return enqueueWrite(() => Storage.setItem(KEY, serializeKillSwitchCache(cache)))
}
