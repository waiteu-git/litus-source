import { Storage } from './asyncStorage'
import { createWriteQueue } from './writeQueue'

const KEY = 'tutorial.dismissedHints.v1'

const enqueueWrite = createWriteQueue()

/** 閉じられたヒントカードのキー集合（壊れ値は空＝再表示に倒す）。 */
export async function loadDismissedHints(): Promise<string[]> {
  const raw = await Storage.getItem(KEY)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

/** 直列キュー内でread-modify-write（複数画面の連続クローズで片方が消えるlost update回避・単一ライタ規約）。 */
export async function mutateDismissedHints(mutate: (keys: string[]) => string[]): Promise<void> {
  await enqueueWrite(async () => {
    const next = mutate(await loadDismissedHints())
    await Storage.setItem(KEY, JSON.stringify(next))
  })
}

/** 設定「ヒントを再表示」用。全ヒントを未クローズへ戻す（同じキューを通し並行クローズと直列化）。 */
export async function clearDismissedHints(): Promise<void> {
  await enqueueWrite(() => Storage.removeItem(KEY))
}
