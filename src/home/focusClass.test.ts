import { describe, expect, it } from 'vitest'
import { pickFocusClass } from './focusClass'
import type { TimetableCollection } from '../collect/timetableMessage'

// 2026-07-06 は月曜（2026-07-09=木曜を基準に逆算）。時限時刻は CLASS 標準に寄せた例。
const MON = (h: number, m = 0) => new Date(2026, 6, 6, h, m)
const TUE_NOON = new Date(2026, 6, 7, 12, 0)

const periodTimes = {
  campus: '葛飾',
  periods: [
    { period: 1, start: '09:00', end: '10:40' },
    { period: 2, start: '10:50', end: '12:30' },
    { period: 3, start: '13:00', end: '14:40' },
    { period: 4, start: '14:50', end: '16:30' },
    { period: 5, start: '16:40', end: '18:20' },
  ],
}

function cls(name: string, room = 'K404') {
  return { courseCode: name, name, teachers: ['佐藤 健一'], room, isRemote: false, credits: null, badges: [] }
}

function collection(slots: TimetableCollection['slots']): TimetableCollection[] {
  return [{ slots, periodTimes }]
}

describe('pickFocusClass', () => {
  it('今どのコマでもなく本日に授業が無ければ null', () => {
    const cols = collection([{ day: 'mon', period: 3, classes: [cls('情報理論')] }])
    expect(pickFocusClass(cols, TUE_NOON)).toBeNull()
  })

  it('進行中のコマがあれば isNow=true で返す', () => {
    const cols = collection([{ day: 'mon', period: 3, classes: [cls('情報理論')] }])
    const focus = pickFocusClass(cols, MON(13, 30))
    expect(focus).not.toBeNull()
    expect(focus!.isNow).toBe(true)
    expect(focus!.period).toBe(3)
    expect(focus!.name).toBe('情報理論')
    expect(focus!.start).toBe('13:00')
  })

  it('開始前は本日の次の授業を isNow=false で返す', () => {
    const cols = collection([{ day: 'mon', period: 3, classes: [cls('情報理論')] }])
    const focus = pickFocusClass(cols, MON(9, 0))
    expect(focus!.isNow).toBe(false)
    expect(focus!.period).toBe(3)
  })

  it('進行中と後続が両方あれば進行中を優先', () => {
    const cols = collection([
      { day: 'mon', period: 3, classes: [cls('情報理論')] },
      { day: 'mon', period: 5, classes: [cls('統計学')] },
    ])
    const focus = pickFocusClass(cols, MON(13, 30))
    expect(focus!.isNow).toBe(true)
    expect(focus!.name).toBe('情報理論')
  })

  it('複数の後続があれば最も早いコマを返す', () => {
    const cols = collection([
      { day: 'mon', period: 4, classes: [cls('統計学')] },
      { day: 'mon', period: 2, classes: [cls('微分積分学')] },
    ])
    const focus = pickFocusClass(cols, MON(8, 0))
    expect(focus!.period).toBe(2)
    expect(focus!.name).toBe('微分積分学')
  })

  it('本日終了後（後続なし・進行中なし）は null', () => {
    const cols = collection([{ day: 'mon', period: 3, classes: [cls('情報理論')] }])
    expect(pickFocusClass(cols, MON(19, 0))).toBeNull()
  })
})
