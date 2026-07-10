/**
 * ホームの「今やること」カード用に、本日の「今の授業（進行中）」または「次の授業（本日の後続）」を
 * 決める純粋関数。端末非依存・now注入で決定論的（vitestでテスト可能）。
 *
 * 判定: 本日（now の曜日）の授業のうち periodTimes で時刻が引けるものを対象に、
 *   - 進行中（start<=now<=end）があれば最も早いコマを isNow=true で返す
 *   - 無ければ start>now の後続のうち最も早いコマを isNow=false で返す
 *   - どちらも無ければ null（本日の授業が終了 or 授業なし）
 */
import type { TimetableCollection } from '../collect/timetableMessage'
import type { DayOfWeek } from '../parsers/timetable'

const WEEKDAY: Record<DayOfWeek, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }

function hhmmToMin(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

export type FocusClass = {
  period: number
  start: string
  name: string
  room: string
  teachers: string[]
  isRemote: boolean
  courseCode: string
  /** true=進行中（今の授業） / false=本日の後続（次の授業） */
  isNow: boolean
}

type Candidate = { start: number; focus: FocusClass }

export function pickFocusClass(collections: TimetableCollection[], now: Date): FocusClass | null {
  const weekday = now.getDay()
  const nowMin = now.getHours() * 60 + now.getMinutes()

  let ongoing: Candidate | null = null
  let upcoming: Candidate | null = null

  for (const col of collections) {
    const periods = col.periodTimes?.periods ?? []
    for (const slot of col.slots) {
      if (slot.classes.length === 0) continue
      if (WEEKDAY[slot.day] !== weekday) continue
      const pt = periods.find((p) => p.period === slot.period)
      if (!pt) continue
      const start = hhmmToMin(pt.start)
      const end = hhmmToMin(pt.end)
      if (start === null || end === null) continue
      const c = slot.classes[0]
      const base = {
        period: slot.period,
        start: pt.start,
        name: c.name,
        room: c.room,
        teachers: c.teachers,
        isRemote: c.isRemote,
        courseCode: c.courseCode,
      }
      if (nowMin >= start && nowMin <= end) {
        if (!ongoing || start < ongoing.start) ongoing = { start, focus: { ...base, isNow: true } }
      } else if (nowMin < start) {
        if (!upcoming || start < upcoming.start) upcoming = { start, focus: { ...base, isNow: false } }
      }
    }
  }

  return (ongoing ?? upcoming)?.focus ?? null
}
