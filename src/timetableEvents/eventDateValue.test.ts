import { describe, expect, it } from 'vitest'
import { dateToYmd, isValidYmd, ymdToDate } from './eventDateValue'
import { nextDateForWeekday } from './classBlock'

const NOW = new Date(2026, 6, 14, 13, 45, 30, 500) // 2026-07-14 火

describe('isValidYmd', () => {
  it('ゼロ埋めされた実在の日付だけを通す', () => {
    expect(isValidYmd('2026-07-15')).toBe(true)
    expect(isValidYmd('2026-01-01')).toBe(true)
    expect(isValidYmd('2026-12-31')).toBe(true)
  })

  it('形式が違えば弾く', () => {
    expect(isValidYmd('2026-7-5')).toBe(false)
    expect(isValidYmd('')).toBe(false)
    expect(isValidYmd('abc')).toBe(false)
    expect(isValidYmd('2026/07/15')).toBe(false)
    expect(isValidYmd('2026-07-15 10:00')).toBe(false)
  })

  it('存在しない日付を弾く（new Date のロールオーバーを通していた回帰）', () => {
    // 旧実装は new Date('2026-02-31') が NaN にならず 3/3 にロールオーバーするため true を返していた
    expect(isValidYmd('2026-02-31')).toBe(false)
    expect(isValidYmd('2026-04-31')).toBe(false)
    expect(isValidYmd('2026-02-29')).toBe(false) // 2026は平年
    expect(isValidYmd('2028-02-29')).toBe(true) // 2028は閏年
    expect(isValidYmd('2026-13-01')).toBe(false)
    expect(isValidYmd('2026-00-10')).toBe(false)
    expect(isValidYmd('2026-07-00')).toBe(false)
  })
})

describe('ymdToDate', () => {
  it('有効な日付はローカル0時として構築する（UTC解釈による1日ずれを起こさない）', () => {
    const d = ymdToDate('2026-07-15', NOW)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(6)
    expect(d.getDate()).toBe(15)
    expect(d.getHours()).toBe(0)
    expect(d.getMinutes()).toBe(0)
    expect(d.getSeconds()).toBe(0)
    expect(d.getMilliseconds()).toBe(0)
  })

  it('空・不正な値は now の年月日（時刻は0時）', () => {
    for (const s of ['', '2026-02-31', 'abc', '2026-7-5']) {
      const d = ymdToDate(s, NOW)
      expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 6, 14])
      expect(d.getHours()).toBe(0)
    }
  })
})

describe('dateToYmd', () => {
  it('ローカル日付をゼロ埋めして返す', () => {
    expect(dateToYmd(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(dateToYmd(new Date(2026, 11, 31))).toBe('2026-12-31')
    expect(dateToYmd(new Date(2026, 6, 15, 23, 59))).toBe('2026-07-15')
  })
})

describe('往復', () => {
  it('有効な文字列は dateToYmd(ymdToDate(s)) で元に戻る', () => {
    for (const s of ['2026-01-01', '2026-07-15', '2026-12-31', '2028-02-29']) {
      expect(dateToYmd(ymdToDate(s, NOW))).toBe(s)
    }
  })
})

describe('画面初期値との整合', () => {
  it('nextDateForWeekday の戻り値は必ず isValidYmd を通る', () => {
    for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const) {
      for (let i = 0; i < 40; i++) {
        const now = new Date(2026, 0, 20 + i * 9)
        expect(isValidYmd(nextDateForWeekday(day, now))).toBe(true)
      }
    }
  })
})
