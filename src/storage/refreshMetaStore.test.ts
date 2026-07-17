import { describe, it, expect } from 'vitest'
import {
  isAttendanceStatsStale,
  isBulletinStale,
  isTimetableStale,
  ATTENDANCE_STATS_REFRESH_INTERVAL_MS,
} from './refreshMetaStore'

const HOUR = 60 * 60 * 1000
const now = new Date(2026, 6, 17, 12, 0, 0).getTime()

describe('isAttendanceStatsStale', () => {
  it('未収集（0）は常に取りに行く', () => {
    expect(isAttendanceStatsStale(0, now)).toBe(true)
  })

  it('鮮度TTL(6h)内は見送る', () => {
    expect(isAttendanceStatsStale(now - 1 * HOUR, now)).toBe(false)
    expect(isAttendanceStatsStale(now - 5.9 * HOUR, now)).toBe(false)
  })

  it('6h経過で取りに行く（境界）', () => {
    expect(isAttendanceStatsStale(now - 6 * HOUR, now)).toBe(true)
    expect(isAttendanceStatsStale(now - 7 * HOUR, now)).toBe(true)
  })

  it('「最低1日1回」を満たす: 前回から24h経っていれば必ず取りに行く', () => {
    // アプリを1日1回でも開けば、その起動/復帰で必ず収集が走る
    // （バックグラウンド実行が無いため、開かない日は取得できない＝保証はここまで）。
    expect(isAttendanceStatsStale(now - 24 * HOUR, now)).toBe(true)
  })

  it('TTLは6時間＝1日に取りに行くのは最大4回（CLASS負荷を増やさない）', () => {
    expect(ATTENDANCE_STATS_REFRESH_INTERVAL_MS).toBe(6 * HOUR)
    expect(Math.floor(24 / (ATTENDANCE_STATS_REFRESH_INTERVAL_MS / HOUR))).toBe(4)
  })
})

describe('鮮度TTLの棲み分け（他の収集より頻繁にしない）', () => {
  it('出欠(6h)は掲示(3h)より長く、時間割(20h)より短い', () => {
    const at = now - 4 * HOUR
    expect(isBulletinStale(at, now)).toBe(true) // 掲示は3hなので取り直す
    expect(isAttendanceStatsStale(at, now)).toBe(false) // 出欠はまだ鮮度内
    expect(isTimetableStale(at, now)).toBe(false) // 時間割は20hなので当然まだ
  })
})
