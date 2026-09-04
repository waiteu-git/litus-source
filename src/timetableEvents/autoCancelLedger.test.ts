import { describe, it, expect } from 'vitest'
import {
  cancelSlotKey,
  pruneExpiredLedgerKeys,
  courseInTimetable,
  selectAutoRegisterCandidates,
} from './autoCancelLedger'
import type { BulletinEventCandidate } from './bulletinEvents'
import type { TimetableCollection } from '../collect/timetableMessage'

const cand = (over: Partial<BulletinEventCandidate> = {}): BulletinEventCandidate => ({
  courseCode: '9973415',
  courseName: '図学・製図',
  type: 'cancel',
  date: '2026-10-21',
  periods: [3],
  room: null,
  makeup: null,
  sourceBulletinId: 'b1',
  ...over,
})

const col = (classes: { courseCode: string; name: string }[]): TimetableCollection => ({
  slots: [
    {
      day: 'wed',
      period: 3,
      classes: classes.map((c) => ({ ...c, teachers: [], room: '', isRemote: false, credits: null, badges: [] })),
    },
  ],
  periodTimes: null,
})

describe('cancelSlotKey', () => {
  it('コードがあればコードを使う', () => {
    expect(cancelSlotKey('9973415', '図学・製図', '2026-10-21', [3])).toBe('9973415|cancel|2026-10-21|3')
  })

  it('コードが無ければ正規化した科目名を使う', () => {
    expect(cancelSlotKey(null, '図学 ・ 製図', '2026-10-21', [3])).toBe('図学・製図|cancel|2026-10-21|3')
  })

  it('periodsの順序に依存しない（同じスロットは同じキーになる）', () => {
    expect(cancelSlotKey('9973415', 'x', '2026-10-21', [5, 3])).toBe(cancelSlotKey('9973415', 'x', '2026-10-21', [3, 5]))
  })
})

describe('pruneExpiredLedgerKeys', () => {
  it('date < today のキーを落とす（date >= today は残す）', () => {
    const keys = ['a|cancel|2026-09-01|3', 'b|cancel|2026-09-10|3', 'c|cancel|2026-09-04|3']
    expect(pruneExpiredLedgerKeys(keys, '2026-09-04')).toEqual(['b|cancel|2026-09-10|3', 'c|cancel|2026-09-04|3'])
  })

  it('形の壊れたキーは日付が読めないので落とす', () => {
    expect(pruneExpiredLedgerKeys(['broken', ''], '2026-09-04')).toEqual([])
  })

  it('空配列はそのまま空配列', () => {
    expect(pruneExpiredLedgerKeys([], '2026-09-04')).toEqual([])
  })
})

describe('courseInTimetable（禁止事項5: 時間割に無い科目は候補にしない判断の土台）', () => {
  const timetables = [col([{ courseCode: '9973415', name: '図学・製図' }])]

  it('コード一致なら true', () => {
    expect(courseInTimetable({ courseCode: '9973415', courseName: '掲示側の別表記' }, timetables)).toBe(true)
  })

  it('コードが無い候補は正規化名で突合する', () => {
    const tt = [col([{ courseCode: '', name: '図学・製図' }])]
    expect(courseInTimetable({ courseCode: null, courseName: '図学 ・ 製図' }, tt)).toBe(true)
  })

  it('一致する科目が時間割に無ければ false', () => {
    expect(courseInTimetable({ courseCode: '0000000', courseName: '無い科目' }, timetables)).toBe(false)
  })

  it('時間割が未収集(null)なら false', () => {
    expect(courseInTimetable({ courseCode: '9973415', courseName: '図学・製図' }, null)).toBe(false)
  })
})

describe('selectAutoRegisterCandidates', () => {
  const timetables = [col([{ courseCode: '9973415', name: '図学・製図' }])]

  it('台帳に無く時間割にある候補は登録される', () => {
    const { toAdd, keysToAdd } = selectAutoRegisterCandidates([cand()], [], timetables)
    expect(toAdd).toHaveLength(1)
    expect(toAdd[0].type).toBe('cancel')
    expect(toAdd[0].courseCode).toBe('9973415')
    expect(toAdd[0].makeupStatus).toBe('undecided')
    expect(keysToAdd).toEqual(['9973415|cancel|2026-10-21|3'])
  })

  it('🔴回帰: 台帳に既にキーがあれば再登録しない（削除しても復活しないことの土台）', () => {
    // 実際の「削除」操作は別ストア(ClassEvents)なので、ここではその効果を模する:
    // 台帳はスロットキーの有無だけで判断し、ClassEventの現存を一切見ない。
    const key = cancelSlotKey('9973415', '図学・製図', '2026-10-21', [3])
    const { toAdd, keysToAdd } = selectAutoRegisterCandidates([cand()], [key], timetables)
    expect(toAdd).toEqual([])
    expect(keysToAdd).toEqual([])
  })

  it('編集で二重にならない土台: 台帳キーは掲示側候補の日付が基準で、ClassEvent側の編集を見ない', () => {
    // 利用者が ClassEvent.date を書き換えても、掲示本体（候補）の日付は変わらないため、
    // 次回同期で作られる候補のキーは元のまま＝既に台帳にあるので再登録されない。
    const key = cancelSlotKey('9973415', '図学・製図', '2026-10-21', [3])
    const { toAdd } = selectAutoRegisterCandidates([cand()], [key], timetables)
    expect(toAdd).toEqual([])
  })

  it('補講(makeup)候補は対象外（休講のみ自動登録）', () => {
    const { toAdd } = selectAutoRegisterCandidates([{ ...cand(), type: 'makeup' }], [], timetables)
    expect(toAdd).toEqual([])
  })

  it('教室変更(roomChange)候補は対象外', () => {
    const { toAdd } = selectAutoRegisterCandidates([{ ...cand(), type: 'roomChange' }], [], timetables)
    expect(toAdd).toEqual([])
  })

  it('時間割に無い科目は対象外（禁止事項5・消せない休講を作らない）', () => {
    const { toAdd } = selectAutoRegisterCandidates(
      [cand({ courseCode: '0000000', courseName: '無い科目' })],
      [],
      timetables,
    )
    expect(toAdd).toEqual([])
  })

  it('同名科目でもコードが違えば両方登録される（重複除去キーがコード優先）', () => {
    const tt = [col([{ courseCode: '1111111', name: '英語３' }, { courseCode: '2222222', name: '英語３' }])]
    const c1 = cand({ courseCode: '1111111', courseName: '英語３', sourceBulletinId: 'b1' })
    const c2 = cand({ courseCode: '2222222', courseName: '英語３', sourceBulletinId: 'b2' })
    const { toAdd, keysToAdd } = selectAutoRegisterCandidates([c1, c2], [], tt)
    expect(toAdd).toHaveLength(2)
    expect(new Set(keysToAdd).size).toBe(2)
  })

  it('同一バッチ内で同じスロットの候補が重複しても1件だけ登録', () => {
    const { toAdd, keysToAdd } = selectAutoRegisterCandidates([cand(), cand({ sourceBulletinId: 'b2' })], [], timetables)
    expect(toAdd).toHaveLength(1)
    expect(keysToAdd).toHaveLength(1)
  })

  it('IDは手動経路（SubjectDetailScreen）と同じ規則（createdAt=sourceBulletinId）で決定論的', () => {
    const { toAdd } = selectAutoRegisterCandidates([cand()], [], timetables)
    const again = selectAutoRegisterCandidates([cand()], [], timetables)
    expect(toAdd[0].id).toBe(again.toAdd[0].id)
  })
})
