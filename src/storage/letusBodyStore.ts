import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  serializeLetusBodies,
  deserializeLetusBodies,
  setBodyEntry,
  type LetusBodyMap,
} from './letusBodySerialize'
import type { AssignBody } from '../parsers/letusBody'
import { createWriteQueue } from './writeQueue'

const KEY = 'letus.bodyCache.v1'

// 単一ライタ: 詳細画面のオンデマンド取得が並走してもlost updateしない。
const enqueueWrite = createWriteQueue()

export async function loadLetusBody(): Promise<LetusBodyMap> {
  return deserializeLetusBodies(await AsyncStorage.getItem(KEY))
}

/** read-modify-writeを直列キュー内で行う唯一の更新入口。更新後の全件を返す。 */
export async function mutateLetusBody(
  mutate: (m: LetusBodyMap) => LetusBodyMap,
): Promise<LetusBodyMap> {
  return enqueueWrite(async () => {
    const next = mutate(await loadLetusBody())
    await AsyncStorage.setItem(KEY, serializeLetusBodies(next))
    return next
  })
}

/** 1件の本文を fetchedAt 付きで保存する。 */
export async function setLetusBody(
  url: string,
  body: AssignBody,
  fetchedAt: string,
): Promise<LetusBodyMap> {
  return mutateLetusBody((m) => setBodyEntry(m, url, body, fetchedAt))
}
