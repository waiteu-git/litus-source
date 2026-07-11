import { describe, it, expect } from 'vitest'
import {
  weekMondayKey,
  mondayOf,
  isClassOnDate,
  isWeekOff,
  toggleWeek,
  applyBiweeklyPreset,
  clearPattern,
  weekList,
  type WeeklyPattern,
} from './weeklyPattern'

describe('mondayOf / weekMondayKey', () => {
  it('週内のどの曜日でも同じ月曜キーになる', () => {
    // 2026-07-08(水) の週の月曜は 2026-07-06
    expect(weekMondayKey(new Date(2026, 6, 8))).toBe('2026-07-06')
    expect(weekMondayKey(new Date(2026, 6, 6))).toBe('2026-07-06')
    expect(weekMondayKey(new Date(2026, 6, 12))).toBe('2026-07-06') // 日曜も同週
    expect(mondayOf(new Date(2026, 6, 8)).getDate()).toBe(6)
  })
})

describe('isClassOnDate / off', () => {
  it('パターン無し・off無しは常に実施', () => {
    expect(isClassOnDate(undefined, new Date(2026, 6, 8))).toBe(true)
    expect(isClassOnDate({}, new Date(2026, 6, 8))).toBe(true)
  })
  it('off に入った週は休み', () => {
    const p: WeeklyPattern = { off: { '2026-07-06': true } }
    expect(isClassOnDate(p, new Date(2026, 6, 8))).toBe(false)
    expect(isClassOnDate(p, new Date(2026, 6, 15))).toBe(true) // 別週は実施
    expect(isWeekOff(p, new Date(2026, 6, 8))).toBe(true)
  })
})

describe('toggleWeek', () => {
  it('実施↔休みをトグルし、空なら {} に畳む', () => {
    const w = new Date(2026, 6, 8)
    const p1 = toggleWeek({}, w)
    expect(isWeekOff(p1, w)).toBe(true)
    const p2 = toggleWeek(p1, w)
    expect(p2.off).toBeUndefined()
  })
})

describe('applyBiweeklyPreset', () => {
  it('anchor週=実施、交互に休み', () => {
    const weeks = weekList(new Date(2026, 6, 8), 0, 3) // 4週: 7/6, 7/13, 7/20, 7/27
    const p = applyBiweeklyPreset(weeks[0], weeks)
    expect(isClassOnDate(p, weeks[0])).toBe(true) // anchor 実施
    expect(isClassOnDate(p, weeks[1])).toBe(false) // 次週 休み
    expect(isClassOnDate(p, weeks[2])).toBe(true)
    expect(isClassOnDate(p, weeks[3])).toBe(false)
  })
})

describe('clearPattern / weekList', () => {
  it('clearPattern は空', () => expect(clearPattern()).toEqual({}))
  it('weekList は back+forward+1 週を月曜で返す', () => {
    const ws = weekList(new Date(2026, 6, 8), 2, 16)
    expect(ws).toHaveLength(19)
    expect(weekMondayKey(ws[2])).toBe('2026-07-06') // 中央=今週
    expect(ws.every((d) => d.getDay() === 1)).toBe(true) // 全て月曜
  })
})
