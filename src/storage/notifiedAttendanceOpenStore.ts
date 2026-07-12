import AsyncStorage from '@react-native-async-storage/async-storage'
import { serializeNotifiedIds, deserializeNotifiedIds } from './notifiedBulletinsSerialize'
import { createWriteQueue } from './writeQueue'

/**
 * 出席受付openローカル通知の「通知済みキー」永続層。
 * キーは attendanceOpenNotify.attendanceOpenKey（`YYYY-MM-DD|科目|受付時間`）。
 * 直列化は掲示と同型（文字列配列JSON・壊れ値は空配列）を流用する。
 * 書き手は AttendanceEngineProvider の1箇所のみ＝AsyncStorage単一ライタ原則に適合。
 */
const KEY = 'info.notifiedAttendanceOpen.v1'

const enqueueWrite = createWriteQueue()

/** これまでに受付open通知を出したキーの集合（キル→再起動しても同一受付で再通知しない）。 */
export async function loadNotifiedAttendanceOpen(): Promise<string[]> {
  return deserializeNotifiedIds(await AsyncStorage.getItem(KEY))
}

/** 通知済みキーを直列キュー内で read-modify-write する（単一ライタ）。更新後を返す。 */
export async function mutateNotifiedAttendanceOpen(
  mutate: (keys: string[]) => string[],
): Promise<string[]> {
  return enqueueWrite(async () => {
    const next = mutate(await loadNotifiedAttendanceOpen())
    await AsyncStorage.setItem(KEY, serializeNotifiedIds(next))
    return next
  })
}
