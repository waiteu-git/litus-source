import { describe, expect, it } from 'vitest'
import { isTimetableStale, TIMETABLE_REFRESH_INTERVAL_MS } from './refreshMetaStore'

describe('isTimetableStale', () => {
  const now = 1_000_000_000_000
  it('未更新(0)は stale', () => {
    expect(isTimetableStale(0, now)).toBe(true)
  })
  it('間隔未満なら stale でない', () => {
    expect(isTimetableStale(now - (TIMETABLE_REFRESH_INTERVAL_MS - 1), now)).toBe(false)
  })
  it('間隔ちょうど/超過なら stale', () => {
    expect(isTimetableStale(now - TIMETABLE_REFRESH_INTERVAL_MS, now)).toBe(true)
    expect(isTimetableStale(now - TIMETABLE_REFRESH_INTERVAL_MS * 2, now)).toBe(true)
  })
})
