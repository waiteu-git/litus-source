import { describe, expect, it } from 'vitest'
import { classPeriodStatus, parseAcademicCalendar, termOf } from './academicCalendar'

// 2026年度の実暦に近い値（前期は週送りクランプと同じ 8/7、後期開始は実測の 9/11）。
const CAL = parseAcademicCalendar({
  terms: [
    { id: '2026-fall', start: '2026-09-11', end: '2027-01-26' },
    { id: '2026-spring', start: '2026-04-09', end: '2026-08-07' },
  ],
})

describe('parseAcademicCalendar', () => {
  it('開始順に並べ替える（配信順に依存しない）', () => {
    expect(CAL?.terms.map((t) => t.id)).toEqual(['2026-spring', '2026-fall'])
  })

  it('壊れた要素だけ落とし、他は生かす', () => {
    const c = parseAcademicCalendar({
      terms: [
        { id: 'ok', start: '2026-04-09', end: '2026-08-07' },
        { id: '逆転', start: '2026-09-11', end: '2026-04-01' },
        { id: '書式違い', start: '2026/09/11', end: '2027-01-26' },
        { id: '欠落' },
        'not-an-object',
      ],
    })
    expect(c?.terms.map((t) => t.id)).toEqual(['ok'])
  })

  it('🔴 判定できない入力は null（＝fail-open へ倒す材料）', () => {
    expect(parseAcademicCalendar(null)).toBeNull()
    expect(parseAcademicCalendar({})).toBeNull()
    expect(parseAcademicCalendar({ terms: [] })).toBeNull()
    expect(parseAcademicCalendar({ terms: 'x' })).toBeNull()
    expect(parseAcademicCalendar([])).toBeNull()
  })
})

describe('classPeriodStatus', () => {
  it('授業実施期間の中（境界の両端を含む）', () => {
    expect(classPeriodStatus(CAL, '2026-04-09')).toBe('in')
    expect(classPeriodStatus(CAL, '2026-08-07')).toBe('in')
    expect(classPeriodStatus(CAL, '2026-09-11')).toBe('in')
    expect(classPeriodStatus(CAL, '2027-01-26')).toBe('in')
  })

  it('🔴 学期間は between（ユーザー要望＝ここで通知を止める）', () => {
    expect(classPeriodStatus(CAL, '2026-08-08')).toBe('between')
    expect(classPeriodStatus(CAL, '2026-08-28')).toBe('between') // 今日
    expect(classPeriodStatus(CAL, '2026-09-10')).toBe('between') // 後期開始の前日
  })

  it('🔴 未来の期間が無い暦は unknown（更新忘れで永久に黙らせない）', () => {
    expect(classPeriodStatus(CAL, '2027-01-27')).toBe('unknown')
    expect(classPeriodStatus(CAL, '2028-05-01')).toBe('unknown')
  })

  it('🔴 暦が無い・壊れた日付は unknown（fail-open）', () => {
    expect(classPeriodStatus(null, '2026-08-28')).toBe('unknown')
    expect(classPeriodStatus(CAL, '2026/08/28')).toBe('unknown')
  })
})

describe('termOf', () => {
  it('期間内はその期間', () => {
    expect(termOf(CAL, '2026-05-01')?.id).toBe('2026-spring')
    expect(termOf(CAL, '2026-10-01')?.id).toBe('2026-fall')
  })

  it('🔴 学期間は前後の中点で分ける＝8/26という体感値をコードに持たない', () => {
    // 8/7 と 9/11 の中点は 8/24。ユーザーの体感（8/26前後）とほぼ一致し、毎年自動で追随する。
    expect(termOf(CAL, '2026-08-23')?.id).toBe('2026-spring')
    expect(termOf(CAL, '2026-08-25')?.id).toBe('2026-fall')
    expect(termOf(CAL, '2026-08-28')?.id).toBe('2026-fall') // 今日は後期側
  })

  it('最初の期間より前は、これから始まる学期に属させる', () => {
    expect(termOf(CAL, '2026-03-01')?.id).toBe('2026-spring')
  })

  it('🔴 古い暦・暦なしは null（呼び出し側が従来の近似へ退避する）', () => {
    expect(termOf(CAL, '2027-02-01')).toBeNull()
    expect(termOf(null, '2026-08-28')).toBeNull()
  })
})
