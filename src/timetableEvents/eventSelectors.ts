import { makeupOccurrences, type ClassEvent, type MakeupOccurrence } from './classEvent'

const p2 = (n: number) => String(n).padStart(2, '0')
export function todayKey(now: Date): string {
  return `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`
}

/** courseName・period に一致する、当日以降で最も近いイベント。補講(単独)は対象外。無ければ null。 */
export function pickCellEvent(events: ClassEvent[], courseName: string, period: number, now: Date): ClassEvent | null {
  const today = todayKey(now)
  const hits = events
    .filter((e) => e.courseName === courseName && e.periods.includes(period) && e.date >= today && e.type !== 'makeup')
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return hits[0] ?? null
}

/** date が当日のイベント。 */
export function todayEvents(events: ClassEvent[], now: Date): ClassEvent[] {
  const today = todayKey(now)
  return events.filter((e) => e.date === today)
}

/** 当日以降の補講オカレンスを日付昇順で。 */
export function upcomingMakeups(events: ClassEvent[], now: Date): MakeupOccurrence[] {
  const today = todayKey(now)
  return makeupOccurrences(events)
    .filter((m) => m.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}
