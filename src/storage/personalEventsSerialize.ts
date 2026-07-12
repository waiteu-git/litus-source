import { PERSONAL_DAYS, type PersonalEvent, type PersonalDayKey } from '../timetableEvents/personalEvent'

export function serializePersonalEvents(events: PersonalEvent[]): string {
  return JSON.stringify(events)
}

function numArray(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : []
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

export function deserializePersonalEvents(raw: string | null): PersonalEvent[] {
  if (!raw) return []
  let arr: unknown
  try {
    arr = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  const out: PersonalEvent[] = []
  for (const it of arr) {
    if (typeof it !== 'object' || it === null) continue
    const o = it as Record<string, unknown>
    if (!str(o.id) || !str(o.title) || !PERSONAL_DAYS.includes(o.day as PersonalDayKey)) continue
    out.push({
      id: str(o.id),
      title: str(o.title),
      day: o.day as PersonalDayKey,
      periods: numArray(o.periods),
      place: strOrNull(o.place),
      note: strOrNull(o.note),
      color: strOrNull(o.color),
      createdAt: str(o.createdAt),
    })
  }
  return out
}
