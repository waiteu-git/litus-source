import { describe, expect, it } from 'vitest'
import { reconcileCandidates, type BulletinEventCandidate } from './bulletinEvents'
import type { ClassEvent } from './classEvent'

/**
 * 候補と既存イベントの突合規則（sameSlot）の特性化テスト。
 * 補講の二重登録の修正（設計 2026-09-29）で sameSlot の中身を共通ヘルパーに寄せるため、
 * リファクタの前に**現在の規則を固定**する（このファイルは修正の前後で緑のままであること）。
 */

const cand = (o: Partial<BulletinEventCandidate> = {}): BulletinEventCandidate => ({
  courseCode: '9973415',
  courseName: '図学・製図',
  type: 'roomChange',
  date: '2026-10-21',
  periods: [3],
  room: '1211教室',
  makeup: null,
  sourceBulletinId: 'b1',
  ...o,
})

const ev = (o: Partial<ClassEvent> = {}): ClassEvent => ({
  id: 'e1',
  courseName: '図学・製図',
  courseCode: '9973415',
  type: 'roomChange',
  date: '2026-10-21',
  periods: [3],
  room: '1211教室',
  note: null,
  createdAt: 't',
  ...o,
})

const state = (c: BulletinEventCandidate, e: ClassEvent) => reconcileCandidates([c], [e])[0]

describe('sameSlot の規則（候補と既存イベントの突合）', () => {
  it('同じ授業・種別・日付・コマは added（matchedEventId が付く）', () => {
    const v = state(cand(), ev())
    expect(v.state).toBe('added')
    expect(v.matchedEventId).toBe('e1')
  })

  it('コードが両方あるときはコードで比べる（コードが違えば名称が同じでも別授業）', () => {
    expect(state(cand({ courseCode: '9973415' }), ev({ courseCode: '9999999' })).state).toBe('new')
  })

  it('コードが両方あるときは名称が違っても同じ授業（コード優先）', () => {
    expect(state(cand({ courseName: '図学・製図' }), ev({ courseName: '図学製図（表記ゆれ）' })).state).toBe('added')
  })

  it('片方にコードが無いときは名称で比べる（空白・全角空白を除いて一致）', () => {
    expect(state(cand({ courseCode: null, courseName: '図学 ・ 製図' }), ev({ courseCode: '9973415', courseName: '図学・製図' })).state).toBe('added')
    expect(state(cand({ courseCode: '9973415', courseName: '図学・製図' }), ev({ courseCode: null, courseName: '図学　・　製図' })).state).toBe('added')
  })

  it('片方にコードが無く名称も違えば別授業', () => {
    expect(state(cand({ courseCode: null, courseName: '線形代数学１' }), ev({ courseCode: '9973415', courseName: '図学・製図' })).state).toBe('new')
  })

  it('コマの並び順は関係ない（集合として比べる）', () => {
    expect(state(cand({ periods: [3, 4] }), ev({ periods: [4, 3] })).state).toBe('added')
  })

  it('コマの集合が違えば別（3限と3・4限は別扱い）', () => {
    expect(state(cand({ periods: [3] }), ev({ periods: [3, 4] })).state).toBe('new')
  })

  it('日付が違えば別', () => {
    expect(state(cand({ date: '2026-10-21' }), ev({ date: '2026-10-22' })).state).toBe('new')
  })

  it('種別が違えば別（休講と補講、休講と教室変更）', () => {
    expect(state(cand({ type: 'cancel' }), ev({ type: 'roomChange' })).state).toBe('new')
    expect(state(cand({ type: 'makeup' }), ev({ type: 'roomChange' })).state).toBe('new')
  })

  it('休講＆補講の候補が、補講が確定済み(has)の既存休講に一致すれば added、未確定なら makeupAppend', () => {
    const c = cand({ type: 'cancel', makeup: { date: '2026-09-23', periods: [3], room: '1211教室' } })
    const has = ev({ type: 'cancel', makeupStatus: 'has', makeup: { date: '2026-09-23', periods: [3], room: null } })
    const undecided = ev({ type: 'cancel', makeupStatus: 'undecided', makeup: null })
    expect(state(c, has).state).toBe('added')
    expect(state(c, undecided).state).toBe('makeupAppend')
  })
})
