import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  serializeBulletinDigest,
  deserializeBulletinDigest,
  type BulletinItem,
} from './bulletinDigestSerialize'

const KEY = 'info.bulletinDigest.v1' // キーは据置（deserialize が v1/v2 両対応）

export async function saveBulletinDigest(items: BulletinItem[]): Promise<void> {
  await AsyncStorage.setItem(KEY, serializeBulletinDigest(items))
}

export async function loadBulletinDigest(): Promise<BulletinItem[]> {
  return deserializeBulletinDigest(await AsyncStorage.getItem(KEY))
}

/** 単一項目を読み書きで更新（body付与・既読化・フラグ更新の永続化に使う）。更新後の全件を返す。 */
export async function updateBulletinItem(
  id: string,
  patch: (i: BulletinItem) => BulletinItem,
): Promise<BulletinItem[]> {
  const items = await loadBulletinDigest()
  const next = items.map((i) => (i.id === id ? patch(i) : i))
  await saveBulletinDigest(next)
  return next
}
