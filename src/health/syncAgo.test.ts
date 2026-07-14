import { describe, expect, it } from 'vitest'
import { combinedLastSync, formatSyncAgo, formatSyncAgoShort } from './syncAgo'

describe('combinedLastSync', () => {
  it('両方あれば古い方（全データの保証時刻）', () => {
    expect(combinedLastSync(1000, 2000)).toBe(1000)
    expect(combinedLastSync(3000, 2000)).toBe(2000)
  })
  it('片方だけならその値', () => {
    expect(combinedLastSync(0, 2000)).toBe(2000)
    expect(combinedLastSync(1500, 0)).toBe(1500)
  })
  it('両方未収集なら null（NaN/負値も未収集扱い）', () => {
    expect(combinedLastSync(0, 0)).toBeNull()
    expect(combinedLastSync(Number.NaN, -5)).toBeNull()
  })
})

describe('formatSyncAgo', () => {
  const now = new Date(2026, 6, 14, 12, 0, 0)
  it('null → 未同期', () => {
    expect(formatSyncAgo(null, now)).toBe('未同期')
  })
  it('60秒未満 → たった今同期（将来時刻も同じ）', () => {
    expect(formatSyncAgo(now.getTime() - 59_000, now)).toBe('たった今同期')
    expect(formatSyncAgo(now.getTime() + 10_000, now)).toBe('たった今同期')
  })
  it('60秒〜59分 → ◯分前に同期', () => {
    expect(formatSyncAgo(now.getTime() - 60_000, now)).toBe('1分前に同期')
    expect(formatSyncAgo(now.getTime() - 59 * 60_000, now)).toBe('59分前に同期')
  })
  it('60分以上・同日 → ◯時間前に同期', () => {
    expect(formatSyncAgo(now.getTime() - 60 * 60_000, now)).toBe('1時間前に同期')
    expect(formatSyncAgo(new Date(2026, 6, 14, 0, 5).getTime(), now)).toBe('11時間前に同期')
  })
  it('日をまたぐ → M/D HH:mmに同期', () => {
    expect(formatSyncAgo(new Date(2026, 6, 13, 23, 5).getTime(), now)).toBe('7/13 23:05に同期')
  })
})

describe('formatSyncAgoShort', () => {
  const now = new Date(2026, 6, 14, 12, 0, 0)
  it('null → 未同期', () => {
    expect(formatSyncAgoShort(null, now)).toBe('未同期')
  })
  it('60秒未満 → たった今（suffixなし）', () => {
    expect(formatSyncAgoShort(now.getTime() - 59_000, now)).toBe('たった今')
    expect(formatSyncAgoShort(now.getTime() + 10_000, now)).toBe('たった今')
  })
  it('60秒〜59分 → ◯分前', () => {
    expect(formatSyncAgoShort(now.getTime() - 60_000, now)).toBe('1分前')
    expect(formatSyncAgoShort(now.getTime() - 59 * 60_000, now)).toBe('59分前')
  })
  it('60分以上・同日 → ◯時間前', () => {
    expect(formatSyncAgoShort(new Date(2026, 6, 14, 0, 5).getTime(), now)).toBe('11時間前')
  })
  it('日をまたぐ → M/D（時刻を落とす）', () => {
    expect(formatSyncAgoShort(new Date(2026, 6, 13, 23, 5).getTime(), now)).toBe('7/13')
  })
})
