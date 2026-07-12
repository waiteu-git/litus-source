import { parseAttendanceStats, type AttendanceCourseStats } from '../parsers/attendanceStats'

export type AttendanceStatsResult = { courses: AttendanceCourseStats[]; error: string | null }

const PARSE_ERROR = 'メッセージを解析できませんでした'
const EMPTY_ERROR = '出欠状況を読み取れませんでした'

export function parseAttendanceStatsMessage(raw: string): AttendanceStatsResult {
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return { courses: [], error: PARSE_ERROR }
  }
  if (typeof payload !== 'object' || payload === null) {
    return { courses: [], error: PARSE_ERROR }
  }
  const p = payload as { html?: unknown }
  if (typeof p.html !== 'string') return { courses: [], error: PARSE_ERROR }

  const courses = parseAttendanceStats(p.html)
  return { courses, error: courses.length > 0 ? null : EMPTY_ERROR }
}
