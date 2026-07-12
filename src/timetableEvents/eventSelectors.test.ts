import { describe, expect, it } from 'vitest'
import { pickCellEvent, todayEvents, todaySchedule, upcomingMakeups } from './eventSelectors'
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

describe('todaySchedule', () => {
  it('当日の直接イベント（休講・教室変更・小テスト等）を返す', () => {
    const events = [
      ev({ id: 'q', date: '2026-07-14', type: 'quiz', periods: [1] }),
      ev({ id: 'r', date: '2026-07-14', type: 'roomChange', periods: [3], room: 'K501' }),
      ev({ id: 'x', date: '2026-07-15', type: 'cancel', periods: [2] }),
    ]
    const got = todaySchedule(events, at(7, 14))
    expect(got.map((i) => i.kind)).toEqual(['quiz', 'roomChange'])
    expect(got[1].room).toBe('K501')
  })

  it('単独補講(type=makeup)は補講として一度だけ（直接イベントと二重表示しない）', () => {
    const events = [ev({ id: 'm', date: '2026-07-14', type: 'makeup', periods: [5], room: 'K101' })]
    const got = todaySchedule(events, at(7, 14))
    expect(got).toHaveLength(1)
    expect(got[0].kind).toBe('makeup')
    expect(got[0].room).toBe('K101')
  })

  it('休講内包の補講は補講日当日に補講オカレンスとして出す（休講は休講日に）', () => {
    const events = [
      ev({ id: 'c', type: 'cancel', date: '2026-07-14', periods: [2], makeupStatus: 'has', makeup: { date: '2026-07-20', periods: [4], room: 'K300' } }),
    ]
    // 休講日: 休講のみ
    expect(todaySchedule(events, at(7, 14)).map((i) => i.kind)).toEqual(['cancel'])
    // 補講日: 補講オカレンスのみ
    const onMakeup = todaySchedule(events, at(7, 20))
    expect(onMakeup.map((i) => i.kind)).toEqual(['makeup'])
    expect(onMakeup[0].periods).toEqual([4])
    expect(onMakeup[0].room).toBe('K300')
  })

  it('当日以外のイベントは含めない', () => {
    const events = [ev({ date: '2026-07-13', type: 'quiz' }), ev({ date: '2026-07-15', type: 'quiz' })]
    expect(todaySchedule(events, at(7, 14))).toEqual([])
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
