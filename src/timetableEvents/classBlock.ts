import type { TimetableCollection } from '../collect/timetableMessage'
import type { DayOfWeek } from '../parsers/timetable'

const WEEKDAY: Record<DayOfWeek, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }

const p2 = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`

/** 指定曜日で同名の授業が占める時限を昇順で返す（連続ブロック・複数コマ対応）。 */
export function classBlockPeriods(collection: TimetableCollection, day: DayOfWeek, courseName: string): number[] {
  const periods = collection.slots
    .filter((s) => s.day === day && s.classes.some((c) => c.name === courseName))
    .map((s) => s.period)
  return Array.from(new Set(periods)).sort((a, b) => a - b)
}

/** now から見た次の該当曜日の日付（当日が該当曜日なら当日）。'YYYY-MM-DD'。 */
export function nextDateForWeekday(day: DayOfWeek, now: Date): string {
  const target = WEEKDAY[day]
  const cur = now.getDay()
  const delta = (target - cur + 7) % 7
  const d = new Date(now)
  d.setDate(now.getDate() + delta)
  return ymd(d)
}
