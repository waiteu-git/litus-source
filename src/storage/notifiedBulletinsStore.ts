import { Storage } from './asyncStorage'
import { serializeNotifiedIds, deserializeNotifiedIds } from './notifiedBulletinsSerialize'
import { createWriteQueue } from './writeQueue'

const KEY = 'info.notifiedBulletins.v1'

const enqueueWrite = createWriteQueue()

/** これまでに新着通知を出した掲示idの集合（再流入時の再通知抑止に使う）。 */
export async function loadNotifiedBulletins(): Promise<string[]> {
  return deserializeNotifiedIds(await Storage.getItem(KEY))
}

/** 通知済みidを直列キュー内でread-modify-writeする（背景/前景収集の同時進行によるlost update回避）。更新後を返す。 */
export async function mutateNotifiedBulletins(
  mutate: (ids: string[]) => string[],
): Promise<string[]> {
  return enqueueWrite(async () => {
    const next = mutate(await loadNotifiedBulletins())
    await Storage.setItem(KEY, serializeNotifiedIds(next))
    return next
  })
}
