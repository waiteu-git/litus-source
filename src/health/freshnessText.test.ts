import { describe, expect, it } from 'vitest'
import { formatFreshness } from './freshnessText'

// ローカル時刻の Date を作る。
const d = (mo: number, day: number, h: number, mi: number) => new Date(2026, mo - 1, day, h, mi, 0)

describe('formatFreshness', () => {
  const now = d(7, 12, 15, 0)
  it('未収集(0)は null', () => {
    expect(formatFreshness(0, now)).toBeNull()
  })
  it('無効値(NaN/負)は null', () => {
    expect(formatFreshness(Number.NaN, now)).toBeNull()
    expect(formatFreshness(-1, now)).toBeNull()
  })
  it('当日は HH:mm時点の情報（ゼロ埋め）', () => {
    expect(formatFreshness(d(7, 12, 9, 5).getTime(), now)).toBe('09:05時点の情報')
    expect(formatFreshness(d(7, 12, 14, 30).getTime(), now)).toBe('14:30時点の情報')
  })
  it('前日以前は M/D HH:mm時点の情報', () => {
    expect(formatFreshness(d(7, 11, 23, 59).getTime(), now)).toBe('7/11 23:59時点の情報')
    expect(formatFreshness(d(6, 30, 8, 0).getTime(), now)).toBe('6/30 08:00時点の情報')
  })
})
