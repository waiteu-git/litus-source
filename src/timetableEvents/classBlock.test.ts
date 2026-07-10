import { describe, expect, it } from 'vitest'
import { classBlockPeriods, nextDateForWeekday } from './classBlock'
import type { TimetableCollection } from '../collect/timetableMessage'

const col: TimetableCollection = {
  slots: [
    { day: 'tue', period: 1, classes: [{ courseCode: '9975311', name: '物理学実験A', teachers: [], room: '', isRemote: false, credits: null, badges: [] }] },
    { day: 'tue', period: 2, classes: [{ courseCode: '9975311', name: '物理学実験A', teachers: [], room: '', isRemote: false, credits: null, badges: [] }] },
    { day: 'tue', period: 3, classes: [{ courseCode: '9960107', name: '経済学（火3）', teachers: [], room: '', isRemote: false, credits: null, badges: [] }] },
  ],
  periodTimes: null,
}

describe('classBlockPeriods', () => {
  it('連続コマは全時限を昇順で返す', () => {
    expect(classBlockPeriods(col, 'tue', '物理学実験A')).toEqual([1, 2])
  })
  it('単コマはその時限のみ', () => {
    expect(classBlockPeriods(col, 'tue', '経済学（火3）')).toEqual([3])
  })
  it('該当なしは空', () => {
    expect(classBlockPeriods(col, 'mon', '物理学実験A')).toEqual([])
  })
})

describe('nextDateForWeekday', () => {
  it('当日が該当曜日なら当日', () => {
    // 2026-07-14 は火曜。
    expect(nextDateForWeekday('tue', new Date(2026, 6, 14, 10, 0))).toBe('2026-07-14')
  })
  it('次の該当曜日を返す', () => {
    // 2026-07-14(火)からの次の月曜は 2026-07-20。
    expect(nextDateForWeekday('mon', new Date(2026, 6, 14, 10, 0))).toBe('2026-07-20')
  })
})
