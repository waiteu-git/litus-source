import type { AttendanceCourseStats, AttendanceMark } from '../parsers/attendanceStats'

export type RiskLevel = 'safe' | 'warning' | 'danger'
export type AttendanceRisk = {
  attended: number
  absent: number
  late: number
  earlyLeave: number
  official: number
  canceled: number
  scheduledTotal: number
  allowedAbsences: number
  remaining: number
  level: RiskLevel
  trackable: boolean
}
export type RiskOptions = { totalOverride?: number; excludeDates?: string[] }

export function computeAttendanceRisk(stats: AttendanceCourseStats, opts: RiskOptions = {}): AttendanceRisk {
  const exclude = new Set(opts.excludeDates ?? [])
  const sessions = stats.sessions.filter((s) => !(s.date && exclude.has(s.date)))
  const count = (m: AttendanceMark) => sessions.filter((s) => s.mark === m).length

  const attended = count('present')
  const absent = count('absent')
  const late = count('late')
  const earlyLeave = count('earlyLeave')
  const official = count('official')
  const canceled = count('canceled')

  const datedCells = sessions.filter((s) => s.date !== null).length
  // 分母: 上書きがあれば優先。無ければ「日付を持つセル数 − 公欠・休講(いずれも実施回にカウントしない)」。
  const scheduledTotal = opts.totalOverride ?? Math.max(0, datedCells - official - canceled)
  const allowedAbsences = Math.floor(scheduledTotal / 3)
  const remaining = allowedAbsences - absent

  const trackable = stats.ratePercent !== null || attended + absent > 0
  const level: RiskLevel = remaining <= 0 ? 'danger' : remaining <= 1 ? 'warning' : 'safe'

  return { attended, absent, late, earlyLeave, official, canceled, scheduledTotal, allowedAbsences, remaining, level, trackable }
}
