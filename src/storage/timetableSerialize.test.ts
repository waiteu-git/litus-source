import { serializeTimetable, deserializeTimetable } from './timetableSerialize'
import type { TimetableCollection } from '../collect/timetableMessage'

const sample: TimetableCollection[] = [
  {
    slots: [{ day: 'mon', period: 1, classes: [{ courseCode: '9973337', name: '基礎電気数学', teachers: ['王　宇凱'], room: '野：445教室', isRemote: false, credits: 2, badges: [] }] }],
    periodTimes: { campus: '野田', periods: [{ period: 1, start: '08:50', end: '10:20' }] },
  },
]

describe('serialize/deserialize timetable', () => {
  it('往復して同じ内容になる', () => {
    const raw = serializeTimetable(sample)
    expect(deserializeTimetable(raw)).toEqual(sample)
  })

  it('nullは null', () => {
    expect(deserializeTimetable(null)).toBeNull()
  })

  it('壊れたJSONは null', () => {
    expect(deserializeTimetable('not-json')).toBeNull()
  })

  it('配列でなければ null', () => {
    expect(deserializeTimetable(JSON.stringify({ a: 1 }))).toBeNull()
  })

  it('要素がslots配列を持たなければ null', () => {
    expect(deserializeTimetable(JSON.stringify([{ periodTimes: null }]))).toBeNull()
    expect(deserializeTimetable(JSON.stringify([42]))).toBeNull()
  })

  it('空配列は空配列として受ける', () => {
    expect(deserializeTimetable(JSON.stringify([]))).toEqual([])
  })
})
