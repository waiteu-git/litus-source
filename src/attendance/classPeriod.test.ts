import { describe, expect, it } from 'vitest'
import { isInClassPeriod, currentPeriodNumber } from './classPeriod'
import type { TimetableCollection } from '../collect/timetableMessage'

const periodTimes = {
  campus: '野田',
  periods: [
    { period: 1, start: '9:00', end: '10:30' },
    { period: 2, start: '10:40', end: '12:10' },
    { period: 3, start: '13:10', end: '14:40' },
  ],
}

function col(day: 'mon' | 'tue', period: number, hasClass = true): TimetableCollection {
  return {
    slots: [
      {
        day,
        period,
        classes: hasClass
          ? [{ courseCode: 'AB1234', name: '線形代数', teachers: [], room: '', isRemote: false, credits: null, badges: [] }]
          : [],
      },
    ],
    periodTimes,
  }
}

// 2026-07-06 は月曜。
const MON_0930 = new Date(2026, 6, 6, 9, 30) // 1限の最中
const MON_0857 = new Date(2026, 6, 6, 8, 57) // 1限開始5分前（pre内）
const MON_0840 = new Date(2026, 6, 6, 8, 40) // 1限開始20分前（pre外）
const MON_1035 = new Date(2026, 6, 6, 10, 35) // 1限終了後・2限開始前の休み時間
const TUE_0930 = new Date(2026, 6, 7, 9, 30) // 火曜9:30（月曜授業には該当しない）

describe('isInClassPeriod', () => {
  it('登録授業のある時限の最中は true', () => {
    expect(isInClassPeriod([col('mon', 1)], MON_0930)).toBe(true)
  })

  it('開始少し前（既定5分）は true', () => {
    expect(isInClassPeriod([col('mon', 1)], MON_0857)).toBe(true)
  })

  it('開始よりだいぶ前は false', () => {
    expect(isInClassPeriod([col('mon', 1)], MON_0840)).toBe(false)
  })

  it('時限と時限の間（休み時間）は false', () => {
    expect(isInClassPeriod([col('mon', 1)], MON_1035)).toBe(false)
  })

  it('曜日が違えば false', () => {
    expect(isInClassPeriod([col('mon', 1)], TUE_0930)).toBe(false)
  })

  it('その時限に授業が無い（空きコマ）なら false', () => {
    expect(isInClassPeriod([col('mon', 1, false)], MON_0930)).toBe(false)
  })

  it('時限時刻が無ければ false（判定不能）', () => {
    const noTimes: TimetableCollection = { slots: [{ day: 'mon', period: 1, classes: col('mon', 1).slots[0].classes }], periodTimes: null }
    expect(isInClassPeriod([noTimes], MON_0930)).toBe(false)
  })

  it('コレクションが空なら false', () => {
    expect(isInClassPeriod([], MON_0930)).toBe(false)
  })
})

describe('currentPeriodNumber', () => {
  const pt = periodTimes
  it('時限の時間帯内はその時限番号', () => {
    expect(currentPeriodNumber(pt, MON_0930)).toBe(1) // 9:00-10:30
    expect(currentPeriodNumber(pt, new Date(2026, 6, 6, 11, 0))).toBe(2) // 10:40-12:10
  })
  it('休み時間などどの時限でもなければ null', () => {
    expect(currentPeriodNumber(pt, MON_1035)).toBeNull() // 10:30-10:40 の間
  })
  it('periodTimesが無ければ null', () => {
    expect(currentPeriodNumber(null, MON_0930)).toBeNull()
  })
})
