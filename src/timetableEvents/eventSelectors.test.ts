import { describe, expect, it } from 'vitest'
import { pickCellEvent, todayEvents, upcomingMakeups } from './eventSelectors'
import type { ClassEvent } from './classEvent'

let seq = 0
const ev = (o: Partial<ClassEvent>): ClassEvent => ({
  id: `e${seq++}`, courseName: '物理学実験A', courseCode: null, type: 'quiz',
  date: '2026-07-15', periods: [1, 2], room: null, note: null, createdAt: '', ...o,
})
const at = (m: number, d: number) => new Date(2026, m - 1, d, 9, 0)

describe('pickCellEvent', () => {
  it('該当periodを含む直近の未来イベントを返す', () => {
    const events = [ev({ date: '2026-07-15', periods: [1, 2], type: 'quiz' }), ev({ date: '2026-07-22', periods: [1, 2], type: 'cancel' })]
    expect(pickCellEvent(events, '物理学実験A', 1, at(7, 14))?.date).toBe('2026-07-15')
  })
  it('periodを含まないイベントは対象外（片方だけ休講）', () => {
    const events = [ev({ date: '2026-07-15', periods: [1], type: 'cancel' })]
    expect(pickCellEvent(events, '物理学実験A', 2, at(7, 14))).toBeNull()
    expect(pickCellEvent(events, '物理学実験A', 1, at(7, 14))?.type).toBe('cancel')
  })
  it('過去のイベントは返さない', () => {
    const events = [ev({ date: '2026-07-10', periods: [1], type: 'quiz' })]
    expect(pickCellEvent(events, '物理学実験A', 1, at(7, 14))).toBeNull()
  })
})

describe('todayEvents', () => {
  it('当日のイベントのみ', () => {
    const events = [ev({ date: '2026-07-14' }), ev({ date: '2026-07-15' })]
    expect(todayEvents(events, at(7, 14)).map((e) => e.date)).toEqual(['2026-07-14'])
  })
})

describe('upcomingMakeups', () => {
  it('未来の補講オカレンスを日付昇順で返す', () => {
    const events = [
      ev({ id: 'c1', type: 'cancel', date: '2026-07-15', makeupStatus: 'has', makeup: { date: '2026-07-25', periods: [3], room: null } }),
      ev({ id: 'm1', type: 'makeup', date: '2026-07-20', periods: [4], room: null }),
    ]
    expect(upcomingMakeups(events, at(7, 14)).map((m) => m.date)).toEqual(['2026-07-20', '2026-07-25'])
  })
})
