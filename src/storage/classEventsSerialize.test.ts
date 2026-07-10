import { describe, expect, it } from 'vitest'
import { serializeClassEvents, deserializeClassEvents } from './classEventsSerialize'
import type { ClassEvent } from '../timetableEvents/classEvent'

const e: ClassEvent = {
  id: 'e1', courseName: '物理学実験A', courseCode: '9975311', type: 'cancel', date: '2026-07-15',
  periods: [1, 2], room: null, note: 'メモ', createdAt: '2026-07-10T00:00:00.000Z',
  makeupStatus: 'has', makeup: { date: '2026-07-22', periods: [3], room: 'K404' },
}

describe('classEventsSerialize', () => {
  it('round-trip', () => {
    expect(deserializeClassEvents(serializeClassEvents([e]))).toEqual([e])
  })
  it('不正入力は空配列', () => {
    expect(deserializeClassEvents(null)).toEqual([])
    expect(deserializeClassEvents('not json')).toEqual([])
    expect(deserializeClassEvents('{"a":1}')).toEqual([])
  })
  it('必須欠損の要素は捨てる', () => {
    const raw = JSON.stringify([{ id: 'x' }, e])
    expect(deserializeClassEvents(raw)).toEqual([e])
  })
})
