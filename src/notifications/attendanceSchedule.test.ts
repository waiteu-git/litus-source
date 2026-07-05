import { computeAttendanceAlarms, buildAttendanceNotificationContent } from './attendanceSchedule'
import type { TimetableCollection } from '../collect/timetableMessage'

// 2026-07-06 は月曜日
const MONDAY_NOON = new Date(2026, 6, 6, 12, 0, 0, 0)

function collection(): TimetableCollection {
  return {
    slots: [
      { day: 'mon', period: 3, classes: [{ courseCode: '9973339', name: '基礎情報工学A', teachers: ['高木'], room: 'K101', isRemote: false, credits: 2, badges: [] }] },
    ],
    periodTimes: { campus: '野田', periods: [{ period: 3, start: '13:10', end: '14:40' }] },
  }
}

describe('computeAttendanceAlarms', () => {
  it('当日・未来のコマに開始＋ラストチャンスの2件を出す', () => {
    const alarms = computeAttendanceAlarms([collection()], {}, MONDAY_NOON, { daysAhead: 1, lastChanceLeadMinutes: 10 })
    expect(alarms).toHaveLength(2)
    expect(alarms[0]).toMatchObject({ kind: 'attendance-start', courseCode: '9973339', period: 3, day: 'mon' })
    expect(new Date(alarms[0].fireAt)).toEqual(new Date(2026, 6, 6, 13, 10, 0, 0))
    expect(alarms[1]).toMatchObject({ kind: 'attendance-last-chance' })
    expect(new Date(alarms[1].fireAt)).toEqual(new Date(2026, 6, 6, 14, 30, 0, 0))
  })

  it('settingsでcourseCodeがfalseの科目は除外', () => {
    const alarms = computeAttendanceAlarms([collection()], { '9973339': false }, MONDAY_NOON, { daysAhead: 1 })
    expect(alarms).toEqual([])
  })

  it('periodTimesが無ければ時刻を決められず0件', () => {
    const c = collection()
    c.periodTimes = null
    expect(computeAttendanceAlarms([c], {}, MONDAY_NOON, { daysAhead: 1 })).toEqual([])
  })

  it('発火時刻が過去のものは出さない（開始13:10より後の15:00起点なら両方過去）', () => {
    const afterClass = new Date(2026, 6, 6, 15, 0, 0, 0)
    expect(computeAttendanceAlarms([collection()], {}, afterClass, { daysAhead: 1 })).toEqual([])
  })

  it('daysAheadで翌週の同一曜日も拾う', () => {
    const alarms = computeAttendanceAlarms([collection()], {}, MONDAY_NOON, { daysAhead: 8, lastChanceLeadMinutes: 10 })
    // 今週月(2件) + 来週月(2件)
    expect(alarms).toHaveLength(4)
  })
})

describe('buildAttendanceNotificationContent', () => {
  it('開始とラストチャンスで文面が変わる', () => {
    const base = { courseCode: '9973339', courseName: '基礎情報工学A', day: 'mon' as const, period: 3 }
    const start = buildAttendanceNotificationContent({ ...base, kind: 'attendance-start', fireAt: '' })
    const last = buildAttendanceNotificationContent({ ...base, kind: 'attendance-last-chance', fireAt: '' })
    expect(start.title).toContain('基礎情報工学A')
    expect(start.body).not.toEqual(last.body)
    expect(last.body).toContain('基礎情報工学A')
  })
})
