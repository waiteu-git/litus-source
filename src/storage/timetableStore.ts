import { Storage } from './asyncStorage'
import { pickCurrentSemester } from '../collect/semester'
import type { AcademicCalendar } from '../health/academicCalendar'
import type { TimetableCollection } from '../collect/timetableMessage'
import { serializeTimetable, deserializeTimetable } from './timetableSerialize'

const KEY = 'timetable.collections.v1'

export async function saveTimetable(collections: TimetableCollection[]): Promise<void> {
  await Storage.setItem(KEY, serializeTimetable(collections))
}

/**
 * 保存されている**全学期**のコレクション。学期の絞り込みをしない。
 * ⚠ **時間割画面の表示だけ**が使う（表示中の週で学期を選ぶため）。
 * 🔴 他の面（出席・通知・ウィジェット・ホーム）から呼ばないこと＝2学期分を全走査すると
 * 「終わった学期の授業が今日の授業として出る」「終わった科目に出席アラームが鳴る」。
 */
export async function loadAllTimetables(): Promise<TimetableCollection[] | null> {
  return deserializeTimetable(await Storage.getItem(KEY))
}

/**
 * 当該日の学期に絞ったコレクション。**既定は「今日」＝従来の呼び出しは挙動が変わらない。**
 * 🔴 ここが唯一の関門（キーを直接読み書きする箇所は他に無いことを実測済み）。消費側の
 * 全走査9ファイル11箇所は**無編集のまま**これで守られる。
 */
export async function loadTimetable(
  at: Date = new Date(),
  calendar: AcademicCalendar | null = null,
): Promise<TimetableCollection[] | null> {
  const all = await loadAllTimetables()
  return all ? pickCurrentSemester(all, at, calendar) : all
}

export async function clearTimetable(): Promise<void> {
  await Storage.removeItem(KEY)
}
