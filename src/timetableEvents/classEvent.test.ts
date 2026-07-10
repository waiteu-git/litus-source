import { describe, expect, it } from 'vitest'
import { makeupOccurrences, makeClassEventId, type ClassEvent } from './classEvent'

const base = (o: Partial<ClassEvent>): ClassEvent => ({
  id: 'e1', courseName: '物理学実験A', courseCode: null, type: 'cancel',
  date: '2026-07-15', periods: [1, 2], room: null, note: null, createdAt: '2026-07-10T00:00:00.000Z',
  ...o,
})

describe('makeupOccurrences', () => {
  it('休講(makeupStatus=has)の内包補講を1件展開する', () => {
    const e = base({ type: 'cancel', makeupStatus: 'has', makeup: { date: '2026-07-22', periods: [3], room: 'K404' } })
    expect(makeupOccurrences([e])).toEqual([
      { courseName: '物理学実験A', date: '2026-07-22', periods: [3], room: 'K404', sourceId: 'e1' },
    ])
  })
  it('未定/なしの休講は補講を出さない', () => {
    expect(makeupOccurrences([base({ makeupStatus: 'undecided', makeup: null })])).toEqual([])
    expect(makeupOccurrences([base({ makeupStatus: 'none', makeup: null })])).toEqual([])
  })
  it('単独補講(type=makeup)も展開する', () => {
    const e = base({ id: 'm1', type: 'makeup', date: '2026-07-20', periods: [4, 5], room: '会議室' })
    expect(makeupOccurrences([e])).toEqual([
      { courseName: '物理学実験A', date: '2026-07-20', periods: [4, 5], room: '会議室', sourceId: 'm1' },
    ])
  })
})

describe('makeClassEventId', () => {
  it('同じseedで安定、違うseedで別ID', () => {
    const a = makeClassEventId({ createdAt: 'x', courseName: 'A', type: 'quiz', date: '2026-07-15' })
    const b = makeClassEventId({ createdAt: 'x', courseName: 'A', type: 'quiz', date: '2026-07-15' })
    const c = makeClassEventId({ createdAt: 'y', courseName: 'A', type: 'quiz', date: '2026-07-15' })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a.startsWith('evt_')).toBe(true)
  })
})
