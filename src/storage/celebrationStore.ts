import type { CelebrationChoice } from '../celebration/celebration'
import { Storage } from './asyncStorage'
import {
  deserializeCardDismissed,
  deserializeCelebrationChoice,
  serializeCardDismissed,
  serializeCelebrationChoice,
} from './celebrationSerialize'

/** 催しの識別子（soai-2026＝2026年の硤合憲三名誉教授）を含む版つきの名前。別の催しを足しても混ざらない。 */
const KEY = 'celebration.soai-2026.v1'

/** ホームのカードを×で閉じた記録。選択（オン/オフ）とは別のキー＝閉じても起動画面・見出しの線は設定どおり。 */
const CARD_DISMISSED_KEY = 'celebration.soai-2026.card-dismissed.v1'

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

/** 閉じた記録を保存する。false は記録の削除（オフからオンへ戻した時）。 */
export async function saveCelebrationCardDismissed(dismissed: boolean): Promise<void> {
  if (dismissed) await Storage.setItem(CARD_DISMISSED_KEY, serializeCardDismissed(true))
  else await Storage.removeItem(CARD_DISMISSED_KEY)
}

/** 閉じた記録を読む。**読めない時は false（閉じていない）を返し、投げない**（理由は loadCelebrationChoice と同じ）。 */
export async function loadCelebrationCardDismissed(): Promise<boolean> {
  try {
    return deserializeCardDismissed(await Storage.getItem(CARD_DISMISSED_KEY))
  } catch {
    return false
  }
}
