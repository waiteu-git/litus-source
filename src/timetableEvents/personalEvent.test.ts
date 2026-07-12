import { describe, expect, it } from 'vitest'
import { makePersonalEventId, PERSONAL_DAYS } from './personalEvent'

describe('makePersonalEventId', () => {
  it('同じseedで安定、違うseedで別ID', () => {
    const a = makePersonalEventId({ createdAt: 'x', title: 'バイト', day: 'mon' })
    const b = makePersonalEventId({ createdAt: 'x', title: 'バイト', day: 'mon' })
    const c = makePersonalEventId({ createdAt: 'y', title: 'バイト', day: 'mon' })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a.startsWith('pe_')).toBe(true)
  })
})

describe('PERSONAL_DAYS', () => {
  it('月〜日の7曜日を順に持つ', () => {
    expect(PERSONAL_DAYS).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
  })
})
