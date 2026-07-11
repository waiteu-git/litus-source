import { describe, it, expect } from 'vitest'
import {
  isClassOnDate,
  weekParity,
  weekMondayKey,
  setBiweeklyAnchor,
  setWeekException,
  defaultPattern,
  type WeeklyPattern,
} from './weeklyPattern'

// 2026-07-06(月)〜。隣接週は parity が反転する。
const monA = new Date(2026, 6, 8) // 水 (週の月曜=7/6)
const monB = new Date(2026, 6, 15) // 次週 水 (週の月曜=7/13)
const monC = new Date(2026, 6, 22) // 次々週 水 (週の月曜=7/20)

describe('weekParity / weekMondayKey', () => {
  it('隣接週で parity が反転する', () => {
    expect(weekParity(monA)).not.toBe(weekParity(monB))
    expect(weekParity(monA)).toBe(weekParity(monC)) // 1週おきは同じ
  })
  it('週の月曜キーは同週で一致・別週で相違', () => {
    expect(weekMondayKey(monA)).toBe('2026-07-06')
    expect(weekMondayKey(new Date(2026, 6, 10))).toBe('2026-07-06') // 同週金曜
    expect(weekMondayKey(monB)).toBe('2026-07-13')
  })
})

describe('isClassOnDate', () => {
  it('毎週は常に実施', () => {
    expect(isClassOnDate(defaultPattern(), monA)).toBe(true)
    expect(isClassOnDate(defaultPattern(), monB)).toBe(true)
    expect(isClassOnDate(undefined, monA)).toBe(true)
  })
  it('隔週は基準週=実施・翌週=休み・翌々週=実施', () => {
    const p = setBiweeklyAnchor(defaultPattern(), monA) // monAを実施週に
    expect(isClassOnDate(p, monA)).toBe(true)
    expect(isClassOnDate(p, monB)).toBe(false)
    expect(isClassOnDate(p, monC)).toBe(true)
  })
  it('例外はパターンより優先（休み週を今週だけ実施に）', () => {
    let p = setBiweeklyAnchor(defaultPattern(), monA)
    expect(isClassOnDate(p, monB)).toBe(false)
    p = setWeekException(p, monB, true) // monBの週だけ実施
    expect(isClassOnDate(p, monB)).toBe(true)
    expect(isClassOnDate(p, monA)).toBe(true) // 他週は不変
    expect(isClassOnDate(p, monC)).toBe(true)
  })
})

describe('setWeekException は基本判定と一致すれば例外を残さない', () => {
  it('実施週を実施にしても例外は増えない', () => {
    const p0 = setBiweeklyAnchor(defaultPattern(), monA)
    const p1 = setWeekException(p0, monA, true) // monA は元々実施
    expect(p1.exceptions).toBeUndefined()
  })
  it('休み週を実施に→再度休みに戻すと例外が消える', () => {
    const p0 = setBiweeklyAnchor(defaultPattern(), monA)
    const p1 = setWeekException(p0, monB, true) // 例外追加
    expect(p1.exceptions && p1.exceptions['2026-07-13']).toBe(true)
    const p2 = setWeekException(p1, monB, false) // base(休み)に戻す
    expect(p2.exceptions).toBeUndefined()
  })
})

describe('setBiweeklyAnchor 再アンカー', () => {
  it('別の週を基準にすると実施週が入れ替わる', () => {
    const p = setBiweeklyAnchor(defaultPattern(), monB) // monBを実施週に
    expect(isClassOnDate(p, monB)).toBe(true)
    expect(isClassOnDate(p, monA)).toBe(false)
  })
  it('再アンカー時、その週の既存例外は消える', () => {
    let p: WeeklyPattern = setBiweeklyAnchor(defaultPattern(), monA)
    p = setWeekException(p, monA, false) // monAに例外
    p = setBiweeklyAnchor(p, monA) // monAで再アンカー→例外消える・実施に
    expect(isClassOnDate(p, monA)).toBe(true)
  })
})
