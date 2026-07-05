import type { AttendanceAlarmSettings } from '../notifications/attendanceSchedule'

export function serializeAttendanceSettings(s: AttendanceAlarmSettings): string {
  return JSON.stringify(s)
}

/** null/壊れJSON/配列/非オブジェクトは {}。値がbooleanのキーのみ採用。 */
export function deserializeAttendanceSettings(raw: string | null): AttendanceAlarmSettings {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  const out: AttendanceAlarmSettings = {}
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === 'boolean') out[k] = v
  }
  return out
}
