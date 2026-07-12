import { describe, it, expect } from 'vitest'
import { serializeAttendanceOverrides, deserializeAttendanceOverrides } from './attendanceOverridesSerialize'

describe('attendanceOverrides serialize', () => {
  it('round-trips', () => {
    const o = { '9973366': { total: 8 } }
    expect(deserializeAttendanceOverrides(serializeAttendanceOverrides(o))).toEqual(o)
  })
  it('null・壊れJSON・非オブジェクトは空、total非数は無視', () => {
    expect(deserializeAttendanceOverrides(null)).toEqual({})
    expect(deserializeAttendanceOverrides('{')).toEqual({})
    expect(deserializeAttendanceOverrides('[]')).toEqual({})
    expect(deserializeAttendanceOverrides('{"A":{"total":"x"}}')).toEqual({ A: {} })
  })
})
