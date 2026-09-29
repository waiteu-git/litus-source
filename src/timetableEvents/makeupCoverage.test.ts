import { describe, expect, it } from 'vitest'
import { coveredStandaloneMakeups, makeupOccurrences, sameCourse, type ClassEvent } from './classEvent'

/**
 * 「覆われた単独補講」＝同じ補講を、休講に内包された補講（type=cancel・makeupStatus=has・makeup）が持っている
 * 単独補講（type=makeup）。冗長なので内包側を正とし、発生・通知・表示から畳む（設計 2026-09-29）。
 * 表記ゆれで一致しない時は「二重が残るだけ」の安全側に倒す（本物の補講が消える誤爆をしない）ことを、
 * negative のテストで厚く固定する。
 */

const carrier = (o: Partial<ClassEvent> = {}): ClassEvent => ({
  id: 'c1', courseName: '図学・製図', courseCode: '9973415', type: 'cancel', date: '2026-10-21', periods: [3],
  room: null, note: null, createdAt: 't', makeupStatus: 'has',
  makeup: { date: '2026-09-23', periods: [3], room: '1211教室' }, ...o,
})
const standalone = (o: Partial<ClassEvent> = {}): ClassEvent => ({
  id: 's1', courseName: '図学・製図', courseCode: '9973415', type: 'makeup', date: '2026-09-23', periods: [3],
  room: '野：1211教室', note: null, createdAt: 't', ...o,
})

describe('sameCourse', () => {
  it('コードが両方あればコード、無ければ空白除去した名称で比べる', () => {
    expect(sameCourse({ courseCode: 'A', courseName: 'x' }, { courseCode: 'A', courseName: 'y' })).toBe(true)
    expect(sameCourse({ courseCode: 'A', courseName: 'x' }, { courseCode: 'B', courseName: 'x' })).toBe(false)
    expect(sameCourse({ courseCode: null, courseName: '図学 ・ 製図' }, { courseCode: 'A', courseName: '図学・製図' })).toBe(true)
    expect(sameCourse({ courseCode: null, courseName: 'a' }, { courseCode: 'A', courseName: 'b' })).toBe(false)
  })
})

describe('coveredStandaloneMakeups', () => {
  it('同じ補講を内包した休講がある単独補講は、覆う休講の id と対応づく', () => {
    expect(coveredStandaloneMakeups([carrier(), standalone()])).toEqual(new Map([['s1', 'c1']]))
  })

  it('保存順に依らない', () => {
    expect(coveredStandaloneMakeups([standalone(), carrier()])).toEqual(new Map([['s1', 'c1']]))
  })

  it('コマの並び順が違っても集合として一致する', () => {
    const c = carrier({ makeup: { date: '2026-09-23', periods: [4, 3], room: null } })
    expect(coveredStandaloneMakeups([c, standalone({ periods: [3, 4] })]).size).toBe(1)
  })

  describe('畳まない（安全側）', () => {
    it('内包補講が無い（単独補講だけ）', () => {
      expect(coveredStandaloneMakeups([standalone()]).size).toBe(0)
    })
    it('日付が違う', () => {
      expect(coveredStandaloneMakeups([carrier(), standalone({ date: '2026-09-24' })]).size).toBe(0)
    })
    it('コマの集合が違う（3限と3・4限は別）', () => {
      expect(coveredStandaloneMakeups([carrier(), standalone({ periods: [3, 4] })]).size).toBe(0)
    })
    it('コードが両方あって違う（別授業）', () => {
      expect(coveredStandaloneMakeups([carrier(), standalone({ courseCode: '1111111' })]).size).toBe(0)
    })
    it('コードが片方に無く、名称も違う（別授業）', () => {
      expect(coveredStandaloneMakeups([carrier({ courseCode: null }), standalone({ courseCode: null, courseName: '線形代数学１' })]).size).toBe(0)
    })
    it('休講の補講が確定(has)でない（未定・なし）は覆わない。makeup が残っていても', () => {
      const m = { date: '2026-09-23', periods: [3], room: null }
      expect(coveredStandaloneMakeups([carrier({ makeupStatus: 'undecided', makeup: m }), standalone()]).size).toBe(0)
      expect(coveredStandaloneMakeups([carrier({ makeupStatus: 'none', makeup: m }), standalone()]).size).toBe(0)
    })
    it('内包補講どうし・単独補講どうしは畳まない（単独と内包の重複だけが対象）', () => {
      expect(coveredStandaloneMakeups([standalone({ id: 's1' }), standalone({ id: 's2' })]).size).toBe(0)
      expect(coveredStandaloneMakeups([carrier({ id: 'c1' }), carrier({ id: 'c2', date: '2026-10-28' })]).size).toBe(0)
    })
  })
})

describe('makeupOccurrences: 内包＋同じ補講の単独は1件（内包側を正とする）', () => {
  it('1件になり、sourceId は覆う休講', () => {
    const occ = makeupOccurrences([carrier(), standalone()])
    expect(occ).toHaveLength(1)
    expect(occ[0]).toMatchObject({ date: '2026-09-23', periods: [3], sourceId: 'c1' })
  })

  it('保存順に依らず同じ結果', () => {
    expect(makeupOccurrences([standalone(), carrier()])).toEqual(makeupOccurrences([carrier(), standalone()]))
  })

  it('教室: 内包側が null なら単独側を採る', () => {
    const c = carrier({ makeup: { date: '2026-09-23', periods: [3], room: null } })
    expect(makeupOccurrences([c, standalone({ room: '野：1211教室' })])[0].room).toBe('野：1211教室')
  })

  it('教室: 一方が他方を含む（キャンパス接頭辞つき）なら長い方を採る', () => {
    expect(makeupOccurrences([carrier(), standalone()])[0].room).toBe('野：1211教室')
    const c = carrier({ makeup: { date: '2026-09-23', periods: [3], room: '野：1211教室' } })
    expect(makeupOccurrences([c, standalone({ room: '1211教室' })])[0].room).toBe('野：1211教室')
  })

  it('教室: 食い違うときは内包側を採る', () => {
    expect(makeupOccurrences([carrier(), standalone({ room: 'K404' })])[0].room).toBe('1211教室')
  })

  it('教室: 単独側だけ null なら内包側のまま', () => {
    expect(makeupOccurrences([carrier(), standalone({ room: null })])[0].room).toBe('1211教室')
  })

  it('覆われない単独補講・別の補講は従来どおり別々に出る', () => {
    const occ = makeupOccurrences([carrier(), standalone({ id: 's2', date: '2026-09-30' })])
    expect(occ.map((o) => o.date).sort()).toEqual(['2026-09-23', '2026-09-30'])
  })

  it('単独補講だけ・内包補講だけは従来どおり1件', () => {
    expect(makeupOccurrences([standalone()])).toHaveLength(1)
    expect(makeupOccurrences([carrier()])).toHaveLength(1)
  })
})
