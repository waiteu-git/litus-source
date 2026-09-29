import { describe, expect, it } from 'vitest'
import { reconcileCandidates, type BulletinEventCandidate } from './bulletinEvents'
import type { ClassEvent } from './classEvent'

/**
 * 単独補講の候補（【補講】の掲示）は、既存の**休講に内包された同じ補講**にも一致させる（設計 2026-09-29 §2.2）。
 * 一致の優先順位は「内包補講を先に、無ければ同種（単独補講）」。保存順に依らず matchedEventId は覆う休講になる
 * （単独側に一致させると、その行が一覧から隠れて追加済み候補の畳みが効かなくなる）。
 */

const candMakeup = (o: Partial<BulletinEventCandidate> = {}): BulletinEventCandidate => ({
  courseCode: '9973415', courseName: '図学・製図', type: 'makeup', date: '2026-09-23', periods: [3],
  room: '野：1211教室', makeup: null, sourceBulletinId: 'b-makeup', ...o,
})
const carrier = (o: Partial<ClassEvent> = {}): ClassEvent => ({
  id: 'c1', courseName: '図学・製図', courseCode: '9973415', type: 'cancel', date: '2026-10-21', periods: [3],
  room: null, note: null, createdAt: 't', makeupStatus: 'has',
  makeup: { date: '2026-09-23', periods: [3], room: '1211教室' }, ...o,
})
const standalone = (o: Partial<ClassEvent> = {}): ClassEvent => ({
  id: 's1', courseName: '図学・製図', courseCode: '9973415', type: 'makeup', date: '2026-09-23', periods: [3],
  room: '野：1211教室', note: null, createdAt: 't', ...o,
})
const view = (events: ClassEvent[], c = candMakeup()) => reconcileCandidates([c], events)[0]

describe('単独補講の候補は、休講に内包された同じ補講に一致する', () => {
  it('内包補講だけがある → added・matchedEventId は覆う休講', () => {
    expect(view([carrier()])).toMatchObject({ state: 'added', matchedEventId: 'c1' })
  })

  it('単独補講と内包補講が両方ある → 保存順に依らず matchedEventId は覆う休講', () => {
    expect(view([standalone(), carrier()])).toMatchObject({ state: 'added', matchedEventId: 'c1' })
    expect(view([carrier(), standalone()])).toMatchObject({ state: 'added', matchedEventId: 'c1' })
  })

  it('単独補講だけがある（従来どおり）→ added・matchedEventId は単独補講', () => {
    expect(view([standalone()])).toMatchObject({ state: 'added', matchedEventId: 's1' })
  })

  describe('一致させない（安全側・追加ボタンを消さない）', () => {
    it('休講の補講が未定(undecided)・なし(none)（makeup が残っていても）', () => {
      const m = { date: '2026-09-23', periods: [3], room: null }
      expect(view([carrier({ makeupStatus: 'undecided', makeup: m })]).state).toBe('new')
      expect(view([carrier({ makeupStatus: 'none', makeup: m })]).state).toBe('new')
    })
    it('内包補講の日付が違う', () => {
      expect(view([carrier({ makeup: { date: '2026-09-24', periods: [3], room: null } })]).state).toBe('new')
    })
    it('内包補講のコマが違う', () => {
      expect(view([carrier({ makeup: { date: '2026-09-23', periods: [3, 4], room: null } })]).state).toBe('new')
    })
    it('別の授業（コードが両方あって違う）', () => {
      expect(view([carrier({ courseCode: '1111111' })]).state).toBe('new')
    })
    it('何も無ければ new', () => {
      expect(view([]).state).toBe('new')
    })
  })

  it('休講＆補講の候補(cancel)・教室変更の候補は従来どおり（内包補講への一致は単独補講の候補だけ）', () => {
    const cancelCand = candMakeup({ type: 'cancel', date: '2026-10-21', makeup: { date: '2026-09-23', periods: [3], room: null } })
    expect(view([standalone()], cancelCand).state).toBe('new')
    const roomCand = candMakeup({ type: 'roomChange', date: '2026-09-23' })
    expect(view([carrier()], roomCand).state).toBe('new')
  })
})
