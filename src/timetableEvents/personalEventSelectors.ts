import type { PersonalEvent, PersonalDayKey } from './personalEvent'

/** その day+period に落ちる個人予定（複数あれば先頭）。 */
export function personalEventAt(events: PersonalEvent[], day: PersonalDayKey, period: number): PersonalEvent | null {
  return events.find((e) => e.day === day && e.periods.includes(period)) ?? null
}

/** 個人予定がある曜日の集合（列の動的表示用）。 */
export function daysWithPersonal(events: PersonalEvent[]): Set<PersonalDayKey> {
  return new Set(events.map((e) => e.day))
}

/** いずれかの予定が0限を含むか（0限行を出すか）。 */
export function hasZeroPeriod(events: PersonalEvent[]): boolean {
  return events.some((e) => e.periods.includes(0))
}

const minPeriod = (e: PersonalEvent): number => (e.periods.length ? Math.min(...e.periods) : Number.MAX_SAFE_INTEGER)

/** その曜日の個人予定を最小period昇順で返す（リスト表示用）。 */
export function personalEventsOfDay(events: PersonalEvent[], day: PersonalDayKey): PersonalEvent[] {
  return events.filter((e) => e.day === day).sort((a, b) => minPeriod(a) - minPeriod(b))
}
