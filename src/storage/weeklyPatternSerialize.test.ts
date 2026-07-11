import { describe, it, expect } from 'vitest'
import { serializeWeeklyPatterns, deserializeWeeklyPatterns } from './weeklyPatternSerialize'

describe('weeklyPattern serialize 往復', () => {
  it('毎週/隔週/例外を保持', () => {
    const m = {
      A: { mode: 'every' as const },
      B: { mode: 'biweekly' as const, anchorParity: 1 as const, exceptions: { '2026-07-13': true } },
    }
    const got = deserializeWeeklyPatterns(serializeWeeklyPatterns(m))
    expect(got.A.mode).toBe('every')
    expect(got.B.mode).toBe('biweekly')
    expect(got.B.anchorParity).toBe(1)
    expect(got.B.exceptions?.['2026-07-13']).toBe(true)
  })
  it('壊れた入力は空マップ', () => {
    expect(deserializeWeeklyPatterns(null)).toEqual({})
    expect(deserializeWeeklyPatterns('not json')).toEqual({})
    expect(deserializeWeeklyPatterns('[]')).toEqual({})
  })
  it('不正な値は落とす', () => {
    const got = deserializeWeeklyPatterns(
      JSON.stringify({ A: { mode: 'weird', anchorParity: 5, exceptions: { w: 'x' } } }),
    )
    expect(got.A.mode).toBe('every')
    expect(got.A.anchorParity).toBeUndefined()
    expect(got.A.exceptions).toBeUndefined()
  })
})
