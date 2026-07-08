import AsyncStorage from '@react-native-async-storage/async-storage'
import { serializeBulletinDigest, deserializeBulletinDigest, type BulletinItem } from './bulletinDigestSerialize'

const KEY = 'info.bulletinDigest.v1'

export async function saveBulletinDigest(items: BulletinItem[]): Promise<void> {
  await AsyncStorage.setItem(KEY, serializeBulletinDigest(items))
}

export async function loadBulletinDigest(): Promise<BulletinItem[]> {
  return deserializeBulletinDigest(await AsyncStorage.getItem(KEY))
}
