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

describe('countdownStart（試験ごとの表示開始・設計 A §7-2B）', () => {
  const exam = (o: Partial<ClassEvent> = {}): ClassEvent => ({
    id: 'x1',
    courseName: '線形代数学I',
    courseCode: 'C1',
    type: 'midterm',
    date: '2026-07-20',
    periods: [3],
    room: null,
    note: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...o,
  })

  it('days と at は往復で一致する', () => {
    const list = [
      exam({ id: 'd', countdownStart: { kind: 'days', days: 14 } }),
      exam({ id: 'a', countdownStart: { kind: 'at', date: '2026-07-18', time: '08:30' } }),
    ]
    expect(deserializeClassEvents(serializeClassEvents(list))).toStrictEqual(list)
  })

  it('フィールドの無い予定は、往復後も countdownStart を持たない', () => {
    const [back] = deserializeClassEvents(serializeClassEvents([exam()]))
    expect('countdownStart' in back).toBe(false)
  })

  it.each([
    { kind: 'days', days: 10 },
    { kind: 'days', days: '7' },
    { kind: 'weeks', days: 7 },
    { kind: 'at', date: '2026-02-31', time: '09:00' },
    { kind: 'at', date: '2026-07-18', time: '24:00' },
    { kind: 'at', date: '2026-07-18' },
    { kind: 'at', date: '2026/07/18', time: '09:00' },
    null,
    'days',
  ])('壊れた値 %j はフィールドだけ落とし、予定は残す（件数は減らない）', (bad) => {
    const raw = JSON.stringify([{ ...exam({ id: 'bad' }), countdownStart: bad }, exam({ id: 'ok' })])
    const back = deserializeClassEvents(raw)
    expect(back.map((e) => e.id)).toEqual(['bad', 'ok'])
    expect('countdownStart' in back[0]).toBe(false)
  })
})
