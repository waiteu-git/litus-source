import { Storage } from './asyncStorage'
import type { ClassEvent } from '../timetableEvents/classEvent'
import { deserializeClassEvents, serializeClassEvents } from './classEventsSerialize'
import { createWriteQueue } from './writeQueue'

const KEY = 'litus.classEvents.v1'

// bulletinDigestStore / notifiedBulletinsStore と同型: 直列キューで read-modify-write を一本化する。
// 背景同期（掲示由来の自動登録）と画面（追加/削除フォーム）が並行して書いても lost update しない。
const enqueueWrite = createWriteQueue()

export async function loadClassEvents(): Promise<ClassEvent[]> {
  return deserializeClassEvents(await Storage.getItem(KEY))
}
export async function saveClassEvents(events: ClassEvent[]): Promise<void> {
  await Storage.setItem(KEY, serializeClassEvents(events))
}

/**
 * read-modify-write を直列キュー内で行う（lost update 防止の唯一の更新入口）。
 * 🔴 呼び出し側で loadClassEvents() → saveClassEvents() を新しく組み立てないこと
 * （直列化されないため、背景同期と画面編集が同時に走ると後勝ちで片方が消える）。
 * upsert/remove もこの経路を通す。更新後の全件を返す。
 */
export async function mutateClassEvents(
  mutate: (events: ClassEvent[]) => ClassEvent[],
): Promise<ClassEvent[]> {
  return enqueueWrite(async () => {
    const next = mutate(await loadClassEvents())
    await saveClassEvents(next)
    return next
  })
}

export async function upsertClassEvent(event: ClassEvent): Promise<ClassEvent[]> {
  return mutateClassEvents((cur) => [...cur.filter((e) => e.id !== event.id), event])
}
export async function removeClassEvent(id: string): Promise<ClassEvent[]> {
  return mutateClassEvents((cur) => cur.filter((e) => e.id !== id))
}
