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

  it('別の限の休講は該当回を打ち消さない（periodMatches=false）', () => {
    // 月3限を照会。7/13 に 4限の休講がある。4限の休講は 3限を打ち消さない → 7/13 を返す。
    const r = resolveNextSession({
      day: 'mon',
      period: 3,
      baseRoom: 'K404',
      pattern: {},
      events: [ev({ type: 'cancel', date: '2026-07-13', periods: [4], makeupStatus: 'undecided' })],
      now: new Date(2026, 6, 13, 8, 0),
    })
    expect(r?.date).toBe('2026-07-13')
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

  it('内包補講と同じ補講の単独補講が並んでも、次回の教室は保存順に依らず同じ（補講の二重登録・設計 2026-09-29）', () => {
    // 内包側は「S305」、単独側は同じ教室のキャンパス接頭辞つき「野：S305」。以前は先に保存した方の表記が次回に出ていた。
    const carrier = ev({
      id: 'c1',
      type: 'cancel',
      date: '2026-07-13',
      makeupStatus: 'has',
      makeup: { date: '2026-07-15', periods: [4], room: 'S305' },
    })
    const standalone = ev({ id: 's1', type: 'makeup', date: '2026-07-15', periods: [4], room: '野：S305' })
    const args = { day: 'mon' as const, period: 3, baseRoom: 'K404', pattern: {}, now: new Date(2026, 6, 13, 8, 0) }
    const a = resolveNextSession({ ...args, events: [carrier, standalone] })
    const b = resolveNextSession({ ...args, events: [standalone, carrier] })
    expect(a).toEqual({ date: '2026-07-15', period: 4, room: '野：S305', note: '補講' })
    expect(b).toEqual(a)
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
