import type { AttendanceCourseStats } from '../parsers/attendanceStats'

export type AttendanceStatsData = { courses: AttendanceCourseStats[]; collectedAt: number }

export function serializeAttendanceStats(d: AttendanceStatsData): string {
  return JSON.stringify(d)
}

export function deserializeAttendanceStats(raw: string | null): AttendanceStatsData | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const o = parsed as { courses?: unknown; collectedAt?: unknown }
  if (!Array.isArray(o.courses) || typeof o.collectedAt !== 'number') return null
  return { courses: o.courses as AttendanceCourseStats[], collectedAt: o.collectedAt }
}
