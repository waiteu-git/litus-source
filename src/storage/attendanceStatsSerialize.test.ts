import { describe, it, expect } from 'vitest'
import { serializeAttendanceStats, deserializeAttendanceStats } from './attendanceStatsSerialize'
import type { AttendanceCourseStats } from '../parsers/attendanceStats'

const course: AttendanceCourseStats = {
  courseCode: '9973337', courseName: '基礎電気数学', slots: [{ day: 'mon', period: 1 }],
  ratePercent: 91, sessions: [{ date: '04/13', mark: 'absent' }],
}

describe('attendanceStats serialize', () => {
  it('round-trips', () => {
    const data = { courses: [course], collectedAt: 123 }
    expect(deserializeAttendanceStats(serializeAttendanceStats(data))).toEqual(data)
  })
  it('null・壊れJSON・非オブジェクト・courses非配列はnull', () => {
    expect(deserializeAttendanceStats(null)).toBeNull()
    expect(deserializeAttendanceStats('{')).toBeNull()
    expect(deserializeAttendanceStats('42')).toBeNull()
    expect(deserializeAttendanceStats('{"courses":"x","collectedAt":1}')).toBeNull()
  })
})
