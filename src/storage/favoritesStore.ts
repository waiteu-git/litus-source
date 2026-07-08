import AsyncStorage from '@react-native-async-storage/async-storage'
import { deserializeFavorites, serializeFavorites } from './favoritesSerialize'

const KEY = 'info.favorites.v1'

export async function loadFavorites(): Promise<string[]> {
  return deserializeFavorites(await AsyncStorage.getItem(KEY))
}

export async function saveFavorites(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(KEY, serializeFavorites(ids))
}
