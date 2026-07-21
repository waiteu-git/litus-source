import { Storage } from './asyncStorage'
import { deserializeNotifiedIds, serializeNotifiedIds } from './notifiedBulletinsSerialize'
import { createWriteQueue } from './writeQueue'

const KEY = 'letus.notifiedNews.v1'

const enqueueWrite = createWriteQueue()

/** これまでにLETUS新着通知を出した活動URLの集合（掲示の通知済みidと同型・再通知抑止用）。 */
export async function loadNotifiedLetusNews(): Promise<string[]> {
  return deserializeNotifiedIds(await Storage.getItem(KEY))
}

/** 通知済みidを直列キュー内でread-modify-writeする。更新後を返す。 */
export async function mutateNotifiedLetusNews(mutate: (ids: string[]) => string[]): Promise<string[]> {
  return enqueueWrite(async () => {
    const next = mutate(await loadNotifiedLetusNews())
    await Storage.setItem(KEY, serializeNotifiedIds(next))
    return next
  })
}
