import { describe, it, expect } from 'vitest'
import { computeAttendanceRisk } from './attendanceRisk'
import type { AttendanceCourseStats, AttendanceSession } from '../parsers/attendanceStats'

function stats(sessions: AttendanceSession[], ratePercent: number | null = 100): AttendanceCourseStats {
  return { courseCode: 'X', courseName: 'test', slots: [], ratePercent, sessions }
}
const S = (mark: AttendanceSession['mark'], date: string | null = '04/01'): AttendanceSession => ({ date, mark })

describe('computeAttendanceRisk', () => {
  it('×のみ欠席として数え、残り0はdanger', () => {
    const r = computeAttendanceRisk(stats([S('present'), S('present'), S('present'), S('absent')]))
    expect(r.scheduledTotal).toBe(4)
    expect(r.absent).toBe(1)
    expect(r.allowedAbsences).toBe(1) // floor(4/3)
    expect(r.remaining).toBe(0)
    expect(r.level).toBe('danger')
  })

  it('残り1はwarning、残り2以上はsafe', () => {
    const many = Array.from({ length: 12 }, () => S('present'))
    const warn = computeAttendanceRisk(stats([...many, S('absent'), S('absent'), S('absent')])) // total15 allow5 absent... 調整
    // total 15, allowed floor(15/3)=5, absent 3 -> remaining 2 -> safe
    expect(warn.level).toBe('safe')
    const r2 = computeAttendanceRisk(stats([...Array.from({ length: 9 }, () => S('present')), S('absent'), S('absent'), S('absent')]))
    // total 12, allowed 4, absent 3 -> remaining 1 -> warning
    expect(r2.level).toBe('warning')
  })

  it('公欠は分母から除外する', () => {
    const r = computeAttendanceRisk(stats([S('official'), S('official'), S('official'), S('present'), S('present'), S('present')]))
    // datedCells 6 - official 3 = 3, allowed floor(3/3)=1
    expect(r.official).toBe(3)
    expect(r.scheduledTotal).toBe(3)
    expect(r.allowedAbsences).toBe(1)
  })

  it('休講は分母から除外する', () => {
    const r = computeAttendanceRisk(stats([S('canceled'), S('canceled'), S('canceled'), S('present'), S('present'), S('present')]))
    // datedCells 6 - canceled 3 = 3, allowed floor(3/3)=1
    expect(r.canceled).toBe(3)
    expect(r.scheduledTotal).toBe(3)
    expect(r.allowedAbsences).toBe(1)
  })

  it('遅刻・早退は欠席換算せず内訳に出す', () => {
    const r = computeAttendanceRisk(stats([S('late'), S('earlyLeave'), S('present')]))
    expect(r.late).toBe(1)
    expect(r.earlyLeave).toBe(1)
    expect(r.absent).toBe(0)
    expect(r.remaining).toBe(r.allowedAbsences)
  })

  it('totalOverrideで分母を上書きする', () => {
    const r = computeAttendanceRisk(stats([S('present'), S('absent')]), { totalOverride: 15 })
    expect(r.scheduledTotal).toBe(15)
    expect(r.allowedAbsences).toBe(5)
  })

  it('excludeDatesの回を分母と欠席から除く', () => {
    const r = computeAttendanceRisk(stats([S('present', '04/16'), S('absent', '05/07'), S('present', '05/14')]), { excludeDates: ['05/07'] })
    expect(r.absent).toBe(0)
    expect(r.scheduledTotal).toBe(2)
  })

  it('週複数コマは同一日付でもセル単位で数える', () => {
    const r = computeAttendanceRisk(stats([S('present', '04/14'), S('present', '04/14')]))
    expect(r.scheduledTotal).toBe(2)
  })

  it('出席率nullかつ出席/欠席なしはtrackable=false', () => {
    const r = computeAttendanceRisk(stats([S('none', '04/14'), S('none', '04/21')], null))
    expect(r.trackable).toBe(false)
  })
})
