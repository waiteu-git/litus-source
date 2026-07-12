import type { DayOfWeek } from '../parsers/timetable'
import type { ClassEvent } from './classEvent'
import { makeupOccurrences } from './classEvent'
import { type WeeklyPattern, isWeekOff } from './weeklyPattern'

const WEEKDAY: Record<DayOfWeek, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
const p2 = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
const dateOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export type NextSession = { date: string; period?: number; room?: string; note?: string }

/** period 未指定、または e.periods が空なら全限一致とみなす。 */
function periodMatches(e: ClassEvent, period?: number): boolean {
  if (period == null) return true
  if (e.periods.length === 0) return true
  return e.periods.includes(period)
}

/** from 当日を含めた次の該当曜日の Date（ローカル日付）。 */
function nextWeekdayDate(day: DayOfWeek, from: Date): Date {
  const target = WEEKDAY[day]
  const cur = from.getDay()
  const delta = (target - cur + 7) % 7
  const d = dateOnly(from)
  d.setDate(d.getDate() + delta)
  return d
}

/**
 * 実際に次に実施される回を算出する。補講オカレンス（曜日固定外含む）と、
 * 曜日固定の通常回（休講週・休講イベントを除外、教室変更を反映）の中から最短日を返す。
 */
export function resolveNextSession(params: {
  day?: DayOfWeek
  period?: number
  baseRoom?: string
  pattern: WeeklyPattern
  events: ClassEvent[]
  now: Date
  horizonWeeks?: number
}): NextSession | null {
  const { day, period, baseRoom, pattern, events, now, horizonWeeks = 16 } = params
  const todayStr = ymd(dateOnly(now))
  const candidates: NextSession[] = []

  // 1) 補講オカレンス（今日以降）
  for (const m of makeupOccurrences(events)) {
    if (m.date >= todayStr) {
      candidates.push({ date: m.date, period: m.periods[0], room: m.room ?? baseRoom, note: '補講' })
    }
  }

  // 2) 通常回（曜日固定）を horizon まで走査
  if (day) {
    const cancelDates = new Set(
      events.filter((e) => e.type === 'cancel' && periodMatches(e, period)).map((e) => e.date),
    )
    const first = nextWeekdayDate(day, now)
    for (let i = 0; i <= horizonWeeks; i++) {
      const cur = new Date(first)
      cur.setDate(first.getDate() + i * 7)
      const key = ymd(cur)
      if (isWeekOff(pattern, cur)) continue
      if (cancelDates.has(key)) continue
      const rc = events.find((e) => e.type === 'roomChange' && e.date === key && periodMatches(e, period))
      candidates.push({ date: key, period, room: rc?.room ?? baseRoom, note: rc ? '教室変更' : undefined })
      break
    }
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return candidates[0]
}

/** 未来かつ要対応（補講未入力の休講・教室変更）の直近1件。無ければ null。 */
export function pickAttentionEvent(events: ClassEvent[], now: Date): ClassEvent | null {
  const todayStr = ymd(dateOnly(now))
  const sorted = events
    .filter((e) => e.date >= todayStr)
    .filter(
      (e) =>
        (e.type === 'cancel' && e.makeupStatus === 'undecided') || e.type === 'roomChange',
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return sorted[0] ?? null
}
