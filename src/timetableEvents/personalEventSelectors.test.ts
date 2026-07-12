import { describe, expect, it } from 'vitest'
import { personalEventAt, daysWithPersonal, hasZeroPeriod, personalEventsOfDay } from './personalEventSelectors'
import type { PersonalEvent } from './personalEvent'

const ev = (o: Partial<PersonalEvent>): PersonalEvent => ({
  id: 'pe', title: 'バイト', day: 'mon', periods: [1], place: null, note: null, color: null,
  createdAt: 't', ...o,
})

describe('personalEventAt', () => {
  it('day+periodに一致する予定を返す', () => {
    const list = [ev({ id: 'a', day: 'mon', periods: [1, 2] }), ev({ id: 'b', day: 'tue', periods: [3] })]
    expect(personalEventAt(list, 'mon', 2)?.id).toBe('a')
    expect(personalEventAt(list, 'tue', 3)?.id).toBe('b')
  })
  it('一致なしはnull', () => {
    expect(personalEventAt([ev({ periods: [1] })], 'mon', 5)).toBeNull()
  })
  it('重複時は先頭を返す', () => {
    const list = [ev({ id: 'a', periods: [1] }), ev({ id: 'b', periods: [1] })]
    expect(personalEventAt(list, 'mon', 1)?.id).toBe('a')
  })
})

describe('daysWithPersonal', () => {
  it('予定のある曜日集合', () => {
    const s = daysWithPersonal([ev({ day: 'mon' }), ev({ day: 'sun' }), ev({ day: 'mon' })])
    expect([...s].sort()).toEqual(['mon', 'sun'])
  })
})

describe('hasZeroPeriod', () => {
  it('0限を含む予定があればtrue', () => {
    expect(hasZeroPeriod([ev({ periods: [0, 1] })])).toBe(true)
    expect(hasZeroPeriod([ev({ periods: [1] })])).toBe(false)
    expect(hasZeroPeriod([])).toBe(false)
  })
})

describe('personalEventsOfDay', () => {
  it('その曜日の予定を最小period昇順で返す', () => {
    const list = [ev({ id: 'late', day: 'mon', periods: [5] }), ev({ id: 'early', day: 'mon', periods: [0] }), ev({ id: 'other', day: 'tue', periods: [1] })]
    expect(personalEventsOfDay(list, 'mon').map((e) => e.id)).toEqual(['early', 'late'])
  })
})
