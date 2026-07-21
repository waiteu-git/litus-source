import { describe, it, expect } from 'vitest'
import {
  weekDiff,
  defaultWeekMonday,
  viewedWeekMonday,
  currentWeekOffset,
  clampOffset,
  weekOrdinal,
} from './weekNav'

// 基準: 2026-07-13(月) 〜 2026-07-19(日)。7/15=水, 7/18=土, 7/19=日。
const WED = new Date(2026, 6, 15)
const SAT = new Date(2026, 6, 18)
const SUN = new Date(2026, 6, 19)
const MON_0713 = new Date(2026, 6, 13)

describe('defaultWeekMonday', () => {
  it('月〜土は今週の月曜（水 7/15 → 7/13）', () => {
    expect(defaultWeekMonday(WED).getDate()).toBe(13)
  })
  it('土曜も今週の月曜（土 7/18 → 7/13）', () => {
    expect(defaultWeekMonday(SAT).getDate()).toBe(13)
  })
  it('日曜のみ翌週の月曜（日 7/19 → 7/20）', () => {
    const m = defaultWeekMonday(SUN)
    expect([m.getMonth(), m.getDate()]).toEqual([6, 20])
  })
  it('月跨ぎの日曜（2026-03-01 日 → 3/2 月）', () => {
    const m = defaultWeekMonday(new Date(2026, 2, 1)) // 3/1 は日曜
    expect([m.getMonth(), m.getDate()]).toEqual([2, 2])
  })
})

describe('viewedWeekMonday', () => {
  it('offset 0 は既定週', () => {
    expect(viewedWeekMonday(WED, 0).getDate()).toBe(13)
  })
  it('offset +1 は翌週（7/20）', () => {
    expect(viewedWeekMonday(WED, 1).getDate()).toBe(20)
  })
  it('offset -1 は前週（7/6）', () => {
    expect(viewedWeekMonday(WED, -1).getDate()).toBe(6)
  })
})

describe('currentWeekOffset', () => {
  it('平日は0', () => {
    expect(currentWeekOffset(WED)).toBe(0)
  })
  it('日曜は-1（既定が翌週のため）', () => {
    expect(currentWeekOffset(SUN)).toBe(-1)
  })
})

describe('clampOffset', () => {
  it('下限でクランプ', () => {
    expect(clampOffset(-5, { min: -2, max: 16 })).toBe(-2)
  })
  it('上限でクランプ', () => {
    expect(clampOffset(20, { min: -2, max: 16 })).toBe(16)
  })
  it('範囲内はそのまま', () => {
    expect(clampOffset(3, { min: -2, max: 16 })).toBe(3)
  })
})

describe('weekOrdinal', () => {
  it('学期起点と同じ週は第1週', () => {
    expect(weekOrdinal(MON_0713, MON_0713)).toBe(1)
  })
  it('2週後は第3週', () => {
    expect(weekOrdinal(new Date(2026, 6, 27), MON_0713)).toBe(3)
  })
  it('学期起点が不明なら null', () => {
    expect(weekOrdinal(MON_0713, null)).toBeNull()
  })
})
