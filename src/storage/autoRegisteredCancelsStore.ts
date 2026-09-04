import { Storage } from './asyncStorage'
import {
  serializeAutoRegisteredCancelKeys,
  deserializeAutoRegisteredCancelKeys,
} from './autoRegisteredCancelsSerialize'
import { createWriteQueue } from './writeQueue'

const KEY = 'litus.autoRegisteredCancels.v1'

// notifiedBulletinsStore と同型（先例に合わせる）: 上限付きキー配列＋直列書き込みキュー。
// ただし戻り値は string[] | null（null＝壊れていて読めない）。理由は serialize 側のコメント参照。
const enqueueWrite = createWriteQueue()

/**
 * これまでに自動登録した休講スロットのキー台帳。
 * 🔴 null（壊れている/読めない）と []（未初期化/正常に空）を区別する。呼び出し側は
 * null を「自動登録しない」に倒すこと（210と同じ挙動。逆＝壊れているから全部登録すると、
 * 利用者が手で消した休講が一斉に復活する＝210で撤去した欠陥）。
 */
export async function loadAutoRegisteredCancelKeys(): Promise<string[] | null> {
  return deserializeAutoRegisteredCancelKeys(await Storage.getItem(KEY))
}

/**
 * read-modify-write を直列キュー内で行う（背景同期の並行実行によるlost update回避）。
 * 台帳が壊れていて読めない時は mutate を呼ばず null を返す（何も書かない）。
 */
export async function mutateAutoRegisteredCancelKeys(
  mutate: (keys: string[]) => string[],
): Promise<string[] | null> {
  return enqueueWrite(async () => {
    const cur = await loadAutoRegisteredCancelKeys()
    if (cur === null) return null
    const next = mutate(cur)
    await Storage.setItem(KEY, serializeAutoRegisteredCancelKeys(next))
    return next
  })
}
