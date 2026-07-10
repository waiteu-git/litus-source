import type { ClassEvent, ClassEventType, MakeupStatus } from '../timetableEvents/classEvent'

const TYPES: ClassEventType[] = ['cancel', 'makeup', 'roomChange', 'quiz', 'midterm', 'final', 'other']
const STATUSES: MakeupStatus[] = ['has', 'none', 'undecided']

export function serializeClassEvents(events: ClassEvent[]): string {
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

export function deserializeClassEvents(raw: string | null): ClassEvent[] {
  if (!raw) return []
  let arr: unknown
  try {
    arr = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  const out: ClassEvent[] = []
  for (const it of arr) {
    if (typeof it !== 'object' || it === null) continue
    const o = it as Record<string, unknown>
    if (!str(o.id) || !str(o.courseName) || !TYPES.includes(o.type as ClassEventType) || !str(o.date)) continue
    const e: ClassEvent = {
      id: str(o.id),
      courseName: str(o.courseName),
      courseCode: strOrNull(o.courseCode),
      type: o.type as ClassEventType,
      date: str(o.date),
      periods: numArray(o.periods),
      room: strOrNull(o.room),
      note: strOrNull(o.note),
      createdAt: str(o.createdAt),
    }
    if (STATUSES.includes(o.makeupStatus as MakeupStatus)) e.makeupStatus = o.makeupStatus as MakeupStatus
    const mk = o.makeup as Record<string, unknown> | null | undefined
    if (mk && typeof mk === 'object') {
      e.makeup = { date: str(mk.date), periods: numArray(mk.periods), room: strOrNull(mk.room) }
    } else if (o.makeup === null) {
      e.makeup = null
    }
    out.push(e)
  }
  return out
}
