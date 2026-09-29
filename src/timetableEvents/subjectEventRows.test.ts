import { describe, expect, it } from 'vitest'
import { parseBulletinDetail } from '../parsers/bulletinDetail'
import { DETAIL_CANCEL_MAKEUP, DETAIL_MAKEUP } from '../parsers/__fixtures__/loadEventDetails'
import type { BulletinItem } from '../storage/bulletinDigestSerialize'
import {
  candidateToClassEvent,
  parseBulletinEvents,
  reconcileCandidates,
  type BulletinEventCandidate,
  type CandidateView,
} from './bulletinEvents'
import type { ClassEvent } from './classEvent'
import { subjectEventRows } from './subjectEventRows'

/**
 * 科目詳細「各回の予定」に出す行（設計 2026-09-29 §2.3）。
 * 追加済みの掲示候補は、対応する登録済みの予定が同じ一覧に見えているときだけ畳む（上下の二重を避ける）。
 * 覆われた単独補講（内包補講と同じ補講）は、メモが無ければ隠す。畳めない側は必ず残す＝どちらも見えなくならない。
 */

const cand = (o: Partial<BulletinEventCandidate> = {}): BulletinEventCandidate => ({
  courseCode: '9973415', courseName: '図学・製図', type: 'roomChange', date: '2026-10-21', periods: [3],
  room: '1211教室', makeup: null, sourceBulletinId: 'b1', ...o,
})
const ev = (o: Partial<ClassEvent> = {}): ClassEvent => ({
  id: 'e1', courseName: '図学・製図', courseCode: '9973415', type: 'roomChange', date: '2026-10-21', periods: [3],
  room: '1211教室', note: null, createdAt: 't', ...o,
})
const carrier = (o: Partial<ClassEvent> = {}): ClassEvent => ev({
  id: 'c1', type: 'cancel', room: null, makeupStatus: 'has',
  makeup: { date: '2026-09-23', periods: [3], room: '1211教室' }, ...o,
})
const standalone = (o: Partial<ClassEvent> = {}): ClassEvent => ev({
  id: 's1', type: 'makeup', date: '2026-09-23', room: '野：1211教室', ...o,
})
const view = (state: CandidateView['state'], id: string, matchedEventId: string | null = null): CandidateView => ({
  candidate: cand({ sourceBulletinId: id }), state, matchedEventId,
})

describe('subjectEventRows: 追加済みの候補の畳み', () => {
  it('畳むものが無ければ、候補も予定も入力のまま（順序も保つ）', () => {
    const cs = [view('new', 'b1'), view('makeupAppend', 'b2', 'e2')]
    const es = [ev({ id: 'e1' }), ev({ id: 'e2', date: '2026-10-28' })]
    const r = subjectEventRows(cs, es)
    expect(r.candidates).toEqual(cs)
    expect(r.events).toEqual(es)
  })

  it('追加済み(added)で、対応する予定が一覧にある候補は畳む（予定の行は残る）', () => {
    const r = subjectEventRows([view('added', 'b1', 'e1'), view('new', 'b2')], [ev({ id: 'e1' })])
    expect(r.candidates.map((v) => v.candidate.sourceBulletinId)).toEqual(['b2'])
    expect(r.events.map((e) => e.id)).toEqual(['e1'])
  })

  it('新規(new)・補講追記(makeupAppend)の候補は畳まない（ボタンが要る）', () => {
    const r = subjectEventRows([view('new', 'b1'), view('makeupAppend', 'b2', 'e1')], [ev({ id: 'e1' })])
    expect(r.candidates).toHaveLength(2)
  })

  it('追加済みでも、対応する予定がこの一覧に無い候補は畳まない（どちらも見えなくなる事故を防ぐ）', () => {
    expect(subjectEventRows([view('added', 'b1', 'gone')], [ev({ id: 'e1' })]).candidates).toHaveLength(1)
    expect(subjectEventRows([view('added', 'b1')], [ev({ id: 'e1' })]).candidates).toHaveLength(1)
  })
})

describe('subjectEventRows: 覆われた単独補講の隠し', () => {
  it('内包補講と同じ補講の単独補講は隠し、休講の行は残す', () => {
    const r = subjectEventRows([], [carrier(), standalone()])
    expect(r.events.map((e) => e.id)).toEqual(['c1'])
  })

  it('保存順に依らない', () => {
    expect(subjectEventRows([], [standalone(), carrier()]).events.map((e) => e.id)).toEqual(['c1'])
  })

  it('メモ(note)がある単独補講は隠さない（手動登録のメモに到達できなくなるのを避ける）', () => {
    const r = subjectEventRows([], [carrier(), standalone({ note: '持ち物: 定規' })])
    expect(r.events.map((e) => e.id)).toEqual(['c1', 's1'])
  })

  it('メモが空白だけなら空とみなして隠す', () => {
    expect(subjectEventRows([], [carrier(), standalone({ note: '  ' })]).events.map((e) => e.id)).toEqual(['c1'])
  })

  it('覆われない単独補講（別の日・内包補講なし・補講が確定でない休講）は隠さない', () => {
    expect(subjectEventRows([], [carrier(), standalone({ date: '2026-09-30' })]).events).toHaveLength(2)
    expect(subjectEventRows([], [standalone()]).events).toHaveLength(1)
    const undecided = carrier({ makeupStatus: 'undecided' })
    expect(subjectEventRows([], [undecided, standalone()]).events).toHaveLength(2)
  })

  it('隠した単独補講を指す追加済み候補は畳まない（候補側の行が唯一の表示になる）', () => {
    const r = subjectEventRows([view('added', 'b1', 's1')], [carrier(), standalone()])
    expect(r.candidates).toHaveLength(1)
    expect(r.events.map((e) => e.id)).toEqual(['c1'])
  })
})

describe('実採取の掲示2通: 科目詳細の各回の予定は、二重に出ない', () => {
  function itemFromHtml(id: string, category: string, title: string, html: string): BulletinItem {
    return { id, category, title, date: '2026/09/01', meta: '', unread: false, flagged: false, important: false, body: parseBulletinDetail(html) }
  }
  const X = itemFromHtml('b-cancel-makeup', '休講', '【休講＆補講】…図学・製図', DETAIL_CANCEL_MAKEUP)
  const Y = itemFromHtml('b-makeup', '補講', '【補講】…図学・製図', DETAIL_MAKEUP)
  const candX = parseBulletinEvents(X)[0]
  const candY = parseBulletinEvents(Y)[0]
  const tapAdd = (events: ClassEvent[], item: BulletinItem): ClassEvent[] => {
    const next = [...events]
    for (const v of reconcileCandidates(parseBulletinEvents(item), events)) {
      if (v.state === 'new') next.push(candidateToClassEvent(v.candidate, v.candidate.sourceBulletinId))
    }
    return next
  }
  const rowsOf = (events: ClassEvent[]) => subjectEventRows(reconcileCandidates([candX, candY], events), events)

  it('何も追加していない: 2通の候補が「追加」つきで並ぶ（掲示が2通実在するため）', () => {
    const r = rowsOf([])
    expect(r.candidates.map((v) => v.state)).toEqual(['new', 'new'])
    expect(r.events).toHaveLength(0)
  })

  const CASES: [string, ClassEvent[]][] = [
    ['休講＆補講 → 補講の順に追加', tapAdd(tapAdd([], X), Y)],
    ['補講 → 休講＆補講の順に追加', tapAdd(tapAdd([], Y), X)],
    ['221までに保存済みの二重（休講＆補講, 補講）', [candidateToClassEvent(candX, candX.sourceBulletinId), candidateToClassEvent(candY, candY.sourceBulletinId)]],
    ['221までに保存済みの二重（補講, 休講＆補講）', [candidateToClassEvent(candY, candY.sourceBulletinId), candidateToClassEvent(candX, candX.sourceBulletinId)]],
  ]
  for (const [label, events] of CASES) {
    it(`${label}: 候補の行は消え、予定の行は休講の1件だけ`, () => {
      const r = rowsOf(events)
      expect(r.candidates).toHaveLength(0)
      expect(r.events).toHaveLength(1)
      expect(r.events[0].type).toBe('cancel')
    })
  }

  it('休講を消すと単独補講の行が現れ（補講の候補は畳まれ）、休講＆補講の候補は再び「追加」つきで出る', () => {
    const events = CASES[2][1].filter((e) => e.type !== 'cancel')
    const r = rowsOf(events)
    expect(r.events.map((e) => e.type)).toEqual(['makeup'])
    expect(r.candidates.map((v) => v.state)).toEqual(['new'])
  })
})
