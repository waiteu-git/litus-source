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
import type { DayOfWeek, Quarter } from '../parsers/timetable'
import { representativeClass } from '../timetableEvents/quarter'

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

export function pickFocusClass(
  collections: TimetableCollection[],
  now: Date,
  /** その科目が今週実施されるか（隔週で休みの週は除外）。省略時は常に実施扱い。 */
  isOn?: (courseCode: string) => boolean,
  currentQuarter?: Quarter,
): FocusClass | null {
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
      const c = representativeClass(slot.classes, currentQuarter)
      if (!c) continue
      if (isOn && !isOn(c.courseCode)) continue
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

export type HomeClass = FocusClass & { end: string }

/**
 * 本日の残り授業（進行中＋後続）を返す。先頭は pickFocusClass と一致（＝ヒーロー）、
 * 以降は開始時刻昇順（＝「このあとの授業」）。終了済みのコマは含めない。
 */
export function todayRemainingClasses(
  collections: TimetableCollection[],
  now: Date,
  isOn?: (courseCode: string) => boolean,
  currentQuarter?: Quarter,
): HomeClass[] {
  const weekday = now.getDay()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const rows: { startMin: number; ongoing: boolean; cls: HomeClass }[] = []
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
      const c = representativeClass(slot.classes, currentQuarter)
      if (!c) continue
      if (isOn && !isOn(c.courseCode)) continue
      const ongoing = nowMin >= start && nowMin <= end
      const upcoming = nowMin < start
      if (!ongoing && !upcoming) continue // 終了済みは除外
      rows.push({
        startMin: start,
        ongoing,
        cls: {
          period: slot.period,
          start: pt.start,
          end: pt.end,
          name: c.name,
          room: c.room,
          teachers: c.teachers,
          isRemote: c.isRemote,
          courseCode: c.courseCode,
          isNow: ongoing,
        },
      })
    }
  }
  // 進行中を先頭、その後は開始時刻昇順。
  rows.sort((a, b) => (a.ongoing !== b.ongoing ? (a.ongoing ? -1 : 1) : a.startMin - b.startMin))
  return rows.map((r) => r.cls)
}
