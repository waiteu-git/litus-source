import type { CelebrationChoice } from '../celebration/celebration'
import { Storage } from './asyncStorage'
import { deserializeCelebrationChoice, serializeCelebrationChoice } from './celebrationSerialize'

/** 催しの識別子（soai-2026＝2026年の硤合憲三名誉教授）を含む版つきの名前。別の催しを足しても混ざらない。 */
const KEY = 'celebration.soai-2026.v1'

export async function saveCelebrationChoice(choice: Exclude<CelebrationChoice, null>): Promise<void> {
  await Storage.setItem(KEY, serializeCelebrationChoice(choice))
}

/**
 * 選択を読む。**読めない時は null（未選択）を返し、投げない。**
 * 投げると LoginGate の起動処理の catch が 'checking' へ進み、規約画面を飛ばして probe が立つ
 * （termsConsentStore.ts と同じ理由）。null は「期間内ならオン」と読まれる＝お祝いが出る側に倒れる。
 */
export async function loadCelebrationChoice(): Promise<CelebrationChoice> {
  try {
    return deserializeCelebrationChoice(await Storage.getItem(KEY))
  } catch {
    return null
  }
}
