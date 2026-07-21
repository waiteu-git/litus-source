import { describe, it, expect } from 'vitest'
import { serializeTimetableOverrides, deserializeTimetableOverrides } from './timetableOverridesSerialize'

describe('timetableOverrides serialize', () => {
  it('round-trips', () => {
    const o = { '9973366': { quarter: 'first' as const } }
    expect(deserializeTimetableOverrides(serializeTimetableOverrides(o))).toEqual(o)
  })
  it('null・壊れJSON・配列は空、不正quarterは空オブジェクト化', () => {
    expect(deserializeTimetableOverrides(null)).toEqual({})
    expect(deserializeTimetableOverrides('{')).toEqual({})
    expect(deserializeTimetableOverrides('[]')).toEqual({})
    expect(deserializeTimetableOverrides('{"A":{"quarter":"x"}}')).toEqual({ A: {} })
    expect(deserializeTimetableOverrides('{"A":{"quarter":"second"}}')).toEqual({ A: { quarter: 'second' } })
  })
})
