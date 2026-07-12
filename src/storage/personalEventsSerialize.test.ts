import { describe, expect, it } from 'vitest'
import { serializePersonalEvents, deserializePersonalEvents } from './personalEventsSerialize'
import type { PersonalEvent } from '../timetableEvents/personalEvent'

const base = (o: Partial<PersonalEvent> = {}): PersonalEvent => ({
  id: 'pe_1', title: 'バイト', day: 'mon', periods: [0, 1], place: 'カフェ',
  note: '18:30〜23:00', color: null, createdAt: '2026-07-12T00:00:00.000Z', ...o,
})

describe('personalEvents serialize', () => {
  it('round-trip で内容が保たれる', () => {
    const arr = [base(), base({ id: 'pe_2', day: 'sun', periods: [3] })]
    expect(deserializePersonalEvents(serializePersonalEvents(arr))).toEqual(arr)
  })
  it('null/不正JSONは空配列', () => {
    expect(deserializePersonalEvents(null)).toEqual([])
    expect(deserializePersonalEvents('{bad')).toEqual([])
    expect(deserializePersonalEvents('{}')).toEqual([])
  })
  it('必須欠損（id/title/不正day）の要素は除去', () => {
    const raw = JSON.stringify([
      base(),
      { ...base(), id: '' },
      { ...base(), title: '' },
      { ...base(), day: 'xxx' },
    ])
    const out = deserializePersonalEvents(raw)
    expect(out.length).toBe(1)
    expect(out[0].id).toBe('pe_1')
  })
  it('periods は数値のみ・0を保持、欠損任意項目はnull補完', () => {
    const raw = JSON.stringify([{ id: 'pe_3', title: '部活', day: 'wed', periods: [0, 'x', 2], createdAt: 't' }])
    const out = deserializePersonalEvents(raw)
    expect(out[0].periods).toEqual([0, 2])
    expect(out[0].place).toBeNull()
    expect(out[0].note).toBeNull()
    expect(out[0].color).toBeNull()
  })
})
