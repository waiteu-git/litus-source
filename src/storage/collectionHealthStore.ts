import AsyncStorage from '@react-native-async-storage/async-storage'
import type { CollectionHealth } from '../health/collectionHealth'
import {
  deserializeCollectionHealth,
  serializeCollectionHealth,
  type CollectionId,
  type CollectionHealthMap,
} from './collectionHealthSerialize'

const KEY = 'health.collections.v1'

export async function loadCollectionHealth(): Promise<CollectionHealthMap> {
  return deserializeCollectionHealth(await AsyncStorage.getItem(KEY))
}

/** 1収集分のヘルスを read-modify-write で更新する（他の収集のヘルスは保持）。 */
export async function saveCollectionHealth(
  id: CollectionId,
  health: CollectionHealth,
  at: number = Date.now(),
): Promise<void> {
  const map = await loadCollectionHealth()
  map[id] = { health, at }
  await AsyncStorage.setItem(KEY, serializeCollectionHealth(map))
}
