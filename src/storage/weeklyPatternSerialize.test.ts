import { describe, it, expect } from 'vitest'
import { serializeWeeklyPatterns, deserializeWeeklyPatterns } from './weeklyPatternSerialize'

describe('weeklyPattern serialize 往復', () => {
  it('休み週(off)を保持', () => {
    const m = { A: {}, B: { off: { '2026-07-13': true as const } } }
    const got = deserializeWeeklyPatterns(serializeWeeklyPatterns(m))
    expect(got.A).toEqual({})
    expect(got.B.off?.['2026-07-13']).toBe(true)
  })
  it('旧v1(exceptions)の false(休み) を off に移行する', () => {
    const v1 = JSON.stringify({
      B: { mode: 'biweekly', anchorParity: 1, exceptions: { '2026-07-13': false, '2026-07-20': true } },
    })
    const got = deserializeWeeklyPatterns(v1)
    expect(got.B.off?.['2026-07-13']).toBe(true) // false=休み → off
    expect(got.B.off?.['2026-07-20']).toBeUndefined() // true=実施 → offにしない
  })
  it('壊れた入力は空マップ', () => {
    expect(deserializeWeeklyPatterns(null)).toEqual({})
    expect(deserializeWeeklyPatterns('not json')).toEqual({})
    expect(deserializeWeeklyPatterns('[]')).toEqual({})
  })
  it('不正な値は落とす（offでない値は無視）', () => {
    const got = deserializeWeeklyPatterns(JSON.stringify({ A: { off: { w: 'x', y: true } } }))
    expect(got.A.off?.['w']).toBeUndefined()
    expect(got.A.off?.['y']).toBe(true)
  })
})
