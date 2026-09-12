import { Storage } from './asyncStorage'
import { serializeNotifiedIds, deserializeNotifiedIds } from './notifiedBulletinsSerialize'
import { createWriteQueue } from './writeQueue'
import { addAnnouncedSlotId } from '../notifications/attendanceOpenNotify'

/**
 * 当日の「受付open 済みのコマ」（N1 §4.3-d・§4.7）。値は開始の枠の identifier（`att:s:YYYYMMDD-HHMM`）の配列（文字列配列JSON）。
 * 書く時に当日以外を捨てる。無い・壊れている → 空＝今と同じく再予約される（鳴る側）。全データ消去（Storage.clearAll）で一緒に消える。
 * 書き手は attendanceOpenFlow の1箇所だけ（直列キュー＝単一ライタ）。読み手は貼り直し（除外 M4）と計器。
 */
const KEY = 'attendance.announcedSlots.v1'

const enqueueWrite = createWriteQueue()

export async function loadAnnouncedSlots(): Promise<string[]> {
  return deserializeNotifiedIds(await Storage.getItem(KEY))
}

/** 1件足す（当日以外を捨て、同じ枠は重複させない）。更新後を返す。 */
export async function addAnnouncedSlot(slotId: string, today: string): Promise<string[]> {
  return enqueueWrite(async () => {
    const next = addAnnouncedSlotId(await loadAnnouncedSlots(), slotId, today)
    await Storage.setItem(KEY, serializeNotifiedIds(next))
    return next
  })
}
