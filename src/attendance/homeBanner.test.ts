import { describe, expect, it } from 'vitest'
import { computeHomeBanner, findActiveClass } from './homeBanner'
import type { TimetableCollection } from '../collect/timetableMessage'
import type { AttendanceReception } from '../collect/attendanceMessage'

const periodTimes = {
  campus: '野田',
  periods: [
    { period: 1, start: '9:00', end: '10:30' },
    { period: 2, start: '10:40', end: '12:10' },
  ],
}

function col(day: 'mon' | 'tue', period: number, name = '線形代数', hasClass = true): TimetableCollection {
  return {
    slots: [
      {
        day,
        period,
        classes: hasClass
          ? [{ courseCode: 'AB1234', name, teachers: [], room: '', isRemote: false, credits: null, badges: [] }]
          : [],
      },
    ],
    periodTimes,
  }
}

function accepting(courseName: string | null): AttendanceReception {
  return { accepting: true, courseName, confirmWindow: '9:00〜9:15', remaining: 'あと5分', error: null }
}
const notAccepting: AttendanceReception = {
  accepting: false,
  courseName: null,
  confirmWindow: null,
  remaining: null,
  error: null,
}

// 2026-07-06 は月曜。1限=9:00-10:30。
const MON_0930 = new Date(2026, 6, 6, 9, 30) // 1限の最中
const MON_1035 = new Date(2026, 6, 6, 10, 35) // 休み時間（授業外）

describe('findActiveClass', () => {
  it('授業時間帯内なら該当科目を返す', () => {
    expect(findActiveClass([col('mon', 1, '解析学')], MON_0930)?.courseName).toBe('解析学')
  })
  it('授業外なら null', () => {
    expect(findActiveClass([col('mon', 1)], MON_1035)).toBeNull()
  })
  it('空きコマは null', () => {
    expect(findActiveClass([col('mon', 1, '線形代数', false)], MON_0930)).toBeNull()
  })
})

describe('computeHomeBanner', () => {
  it('CLASS受付中なら kind=accepting・受付中文言', () => {
    const b = computeHomeBanner([], accepting('英語ⅠA'), MON_1035)
    expect(b.active).toBe(true)
    expect(b.kind).toBe('accepting')
    expect(b.courseName).toBe('英語ⅠA')
    expect(b.text).toContain('受付中')
  })

  it('受付中で科目名が無くても active（フォールバック名）', () => {
    const b = computeHomeBanner([], accepting(null), MON_1035)
    expect(b.active).toBe(true)
    expect(b.kind).toBe('accepting')
    expect(b.text).toContain('受付中')
  })

  it('受付は未確認でも授業時間帯なら kind=class-time・時間割の科目名', () => {
    const b = computeHomeBanner([col('mon', 1, '解析学')], notAccepting, MON_0930)
    expect(b.active).toBe(true)
    expect(b.kind).toBe('class-time')
    expect(b.courseName).toBe('解析学')
    expect(b.text).toContain('解析学')
  })

  it('授業外かつ受付なしなら none・非表示', () => {
    const b = computeHomeBanner([col('mon', 1)], notAccepting, MON_1035)
    expect(b.active).toBe(false)
    expect(b.kind).toBe('none')
  })

  it('授業外かつ reception=null なら none・非表示', () => {
    const b = computeHomeBanner([col('mon', 1)], null, MON_1035)
    expect(b.active).toBe(false)
    expect(b.kind).toBe('none')
  })

  it('受付中は授業時間帯より優先（accepting）', () => {
    const b = computeHomeBanner([col('mon', 1, '解析学')], accepting('英語ⅠA'), MON_0930)
    expect(b.kind).toBe('accepting')
    expect(b.courseName).toBe('英語ⅠA')
  })
})
