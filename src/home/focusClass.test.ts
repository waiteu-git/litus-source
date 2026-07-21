import { describe, expect, it } from 'vitest'
import { pickFocusClass, todayRemainingClasses } from './focusClass'
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

  it('隔週で今週休みの授業(isOn=false)はスキップし次の授業を返す', () => {
    const cols = collection([
      { day: 'mon', period: 2, classes: [cls('隔週ゼミ')] },
      { day: 'mon', period: 4, classes: [cls('統計学')] },
    ])
    const isOn = (code: string) => code !== '隔週ゼミ'
    const focus = pickFocusClass(cols, MON(8, 0), isOn)
    expect(focus!.name).toBe('統計学')
  })
})

describe('pickFocusClass × 半期', () => {
  it('積みコマは currentQuarter に一致する科目を代表に選ぶ', () => {
    // 同一曜限・時刻に first/second の2科目を積む。now は授業時間内。
    const collections: TimetableCollection[] = [
      {
        periodTimes: { campus: '', periods: [{ period: 1, start: '09:00', end: '10:30' }] },
        slots: [
          {
            day: 'wed',
            period: 1,
            classes: [
              { courseCode: 'a', name: '前半科目', teachers: [], room: 'K1', isRemote: false, credits: null, badges: [], quarter: 'first' },
              { courseCode: 'b', name: '後半科目', teachers: [], room: 'K2', isRemote: false, credits: null, badges: [], quarter: 'second' },
            ],
          },
        ],
      },
    ]
    const now = new Date(2026, 6, 15, 9, 30) // 水 9:30
    expect(pickFocusClass(collections, now, undefined, 'second')?.name).toBe('後半科目')
    expect(pickFocusClass(collections, now, undefined, 'first')?.name).toBe('前半科目')
    // currentQuarter 省略時は先頭（後方互換）
    expect(pickFocusClass(collections, now)?.name).toBe('前半科目')
  })
})

describe('todayRemainingClasses × 半期', () => {
  it('積みコマは currentQuarter に一致する科目を代表に選ぶ', () => {
    const collections: TimetableCollection[] = [
      {
        periodTimes: { campus: '', periods: [{ period: 1, start: '09:00', end: '10:30' }] },
        slots: [
          {
            day: 'wed',
            period: 1,
            classes: [
              { courseCode: 'a', name: '前半科目', teachers: [], room: 'K1', isRemote: false, credits: null, badges: [], quarter: 'first' },
              { courseCode: 'b', name: '後半科目', teachers: [], room: 'K2', isRemote: false, credits: null, badges: [], quarter: 'second' },
            ],
          },
        ],
      },
    ]
    const now = new Date(2026, 6, 15, 9, 30) // 水 9:30
    expect(todayRemainingClasses(collections, now, undefined, 'second').map((c) => c.name)).toEqual(['後半科目'])
    expect(todayRemainingClasses(collections, now, undefined, 'first').map((c) => c.name)).toEqual(['前半科目'])
    // currentQuarter 省略時は先頭（後方互換）
    expect(todayRemainingClasses(collections, now).map((c) => c.name)).toEqual(['前半科目'])
  })
})

describe('todayRemainingClasses', () => {
  const cols = collection([
    { day: 'mon', period: 1, classes: [cls('線形代数')] },
    { day: 'mon', period: 3, classes: [cls('情報理論')] },
    { day: 'mon', period: 5, classes: [cls('量子力学')] },
    { day: 'tue', period: 2, classes: [cls('別曜日')] },
  ])
  it('進行中を先頭に、以降を開始時刻昇順で返す（終了済みは除外）', () => {
    // 13:30=3限進行中。1限は終了済み→除外。残り=[3(now),5]。
    const list = todayRemainingClasses(cols, MON(13, 30))
    expect(list.map((c) => c.period)).toEqual([3, 5])
    expect(list[0].isNow).toBe(true)
    expect(list[1].isNow).toBe(false)
    expect(list[0].end).toBe('14:40')
  })
  it('全授業前は当日全コマを昇順で返す', () => {
    const list = todayRemainingClasses(cols, MON(8, 0))
    expect(list.map((c) => c.period)).toEqual([1, 3, 5])
    expect(list.every((c) => !c.isNow)).toBe(true)
  })
  it('全授業後は空', () => {
    expect(todayRemainingClasses(cols, MON(19, 0))).toEqual([])
  })
})
