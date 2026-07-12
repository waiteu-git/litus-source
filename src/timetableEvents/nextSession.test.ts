import { describe, it, expect } from 'vitest'
import { resolveNextSession, pickAttentionEvent } from './nextSession'
import type { ClassEvent } from './classEvent'
import type { WeeklyPattern } from './weeklyPattern'

const ev = (o: Partial<ClassEvent> & Pick<ClassEvent, 'type' | 'date'>): ClassEvent => ({
  id: `id_${o.date}_${o.type}`,
  courseName: '情報リテラシー演習',
  courseCode: '1A2345',
  periods: [3],
  room: null,
  note: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  ...o,
})

// 2026-07-13 は月曜。以降の月曜: 7/13, 7/20, 7/27, 8/3 ...
describe('resolveNextSession', () => {
  it('通常: 次の該当曜日を返す（当日が該当曜日なら当日）', () => {
    const r = resolveNextSession({
      day: 'mon',
      period: 3,
      baseRoom: 'K404',
      pattern: {},
      events: [],
      now: new Date(2026, 6, 13, 8, 0),
    })
    expect(r).toEqual({ date: '2026-07-13', period: 3, room: 'K404', note: undefined })
  })

  it('今週が休講週ならスキップして翌実施週を返す', () => {
    const pattern: WeeklyPattern = { off: { '2026-07-13': true } } // 7/13の週=休み
    const r = resolveNextSession({
      day: 'mon',
      period: 3,
      baseRoom: 'K404',
      pattern,
      events: [],
      now: new Date(2026, 6, 13, 8, 0),
    })
    expect(r?.date).toBe('2026-07-20')
  })

  it('該当回に休講イベントがあれば次回へ送る', () => {
    const r = resolveNextSession({
      day: 'mon',
      period: 3,
      baseRoom: 'K404',
      pattern: {},
      events: [ev({ type: 'cancel', date: '2026-07-13', makeupStatus: 'undecided' })],
      now: new Date(2026, 6, 13, 8, 0),
    })
    expect(r?.date).toBe('2026-07-20')
  })

  it('教室変更があれば room と note を反映する', () => {
    const r = resolveNextSession({
      day: 'mon',
      period: 3,
      baseRoom: 'K404',
      pattern: {},
      events: [ev({ type: 'roomChange', date: '2026-07-13', room: 'S201' })],
      now: new Date(2026, 6, 13, 8, 0),
    })
    expect(r).toEqual({ date: '2026-07-13', period: 3, room: 'S201', note: '教室変更' })
  })

  it('補講日が通常回より早ければ補講を次回に選ぶ', () => {
    // now=7/13。7/13を休講にし、補講が7/15（曜日固定外）。通常の次回は7/20。→ 7/15 が最短。
    const r = resolveNextSession({
      day: 'mon',
      period: 3,
      baseRoom: 'K404',
      pattern: {},
      events: [
        ev({
          type: 'cancel',
          date: '2026-07-13',
          makeupStatus: 'has',
          makeup: { date: '2026-07-15', periods: [4], room: 'S305' },
        }),
      ],
      now: new Date(2026, 6, 13, 8, 0),
    })
    expect(r).toEqual({ date: '2026-07-15', period: 4, room: 'S305', note: '補講' })
  })

  it('day 未指定かつ補講も無ければ null', () => {
    const r = resolveNextSession({
      pattern: {},
      events: [],
      now: new Date(2026, 6, 13, 8, 0),
    })
    expect(r).toBeNull()
  })

  it('horizon 内に実施回が無ければ null', () => {
    // 全週休みにして horizon=2 週で打ち切り
    const pattern: WeeklyPattern = {
      off: { '2026-07-13': true, '2026-07-20': true, '2026-07-27': true },
    }
    const r = resolveNextSession({
      day: 'mon',
      period: 3,
      baseRoom: 'K404',
      pattern,
      events: [],
      now: new Date(2026, 6, 13, 8, 0),
      horizonWeeks: 2,
    })
    expect(r).toBeNull()
  })
})

describe('pickAttentionEvent', () => {
  it('未来の休講(補講未定)を要対応として返す', () => {
    const e = ev({ type: 'cancel', date: '2026-07-20', makeupStatus: 'undecided' })
    const r = pickAttentionEvent([e], new Date(2026, 6, 13))
    expect(r?.date).toBe('2026-07-20')
  })

  it('教室変更も要対応。直近を1件返す', () => {
    const a = ev({ type: 'roomChange', date: '2026-07-27', room: 'S201' })
    const b = ev({ type: 'roomChange', date: '2026-07-20', room: 'S202' })
    const r = pickAttentionEvent([a, b], new Date(2026, 6, 13))
    expect(r?.date).toBe('2026-07-20')
  })

  it('過去のイベント・補講済み休講・小テスト等は対象外', () => {
    const past = ev({ type: 'cancel', date: '2026-07-06', makeupStatus: 'undecided' })
    const resolved = ev({ type: 'cancel', date: '2026-07-20', makeupStatus: 'has' })
    const quiz = ev({ type: 'quiz', date: '2026-07-20' })
    const r = pickAttentionEvent([past, resolved, quiz], new Date(2026, 6, 13))
    expect(r).toBeNull()
  })
})
