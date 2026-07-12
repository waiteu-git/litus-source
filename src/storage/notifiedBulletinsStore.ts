import AsyncStorage from '@react-native-async-storage/async-storage'
import { serializeNotifiedIds, deserializeNotifiedIds } from './notifiedBulletinsSerialize'

const KEY = 'info.notifiedBulletins.v1'

/** これまでに新着通知を出した掲示idの集合（再流入時の再通知抑止に使う）。 */
export async function loadNotifiedBulletins(): Promise<string[]> {
  return deserializeNotifiedIds(await AsyncStorage.getItem(KEY))
}

export async function saveNotifiedBulletins(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(KEY, serializeNotifiedIds(ids))
}
