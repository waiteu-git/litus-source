import { Storage } from './asyncStorage'
import { deserializeFavorites, serializeFavorites } from './favoritesSerialize'

const KEY = 'info.favorites.v1'

export async function loadFavorites(): Promise<string[]> {
  return deserializeFavorites(await Storage.getItem(KEY))
}

export async function saveFavorites(ids: string[]): Promise<void> {
  await Storage.setItem(KEY, serializeFavorites(ids))
}
