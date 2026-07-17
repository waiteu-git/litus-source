import { describe, it, expect } from 'vitest'
import {
  shouldAttemptAttendanceStats,
  ATTENDANCE_STATS_RETRY_INTERVAL_MS,
  ATTENDANCE_STATS_MAX_ATTEMPTS,
} from './attendanceStatsRetry'

const MIN = 60 * 1000
const t0 = 1_700_000_000_000

const base = {
  succeededThisBoot: false,
  attempts: 0,
  lastAttemptAt: null as number | null,
  now: t0,
}

describe('shouldAttemptAttendanceStats', () => {
  it('初回（未試行・未成功）は取りに行く', () => {
    expect(shouldAttemptAttendanceStats(base)).toBe(true)
  })

  it('成功済みなら取りに行かない（鮮度TTLに委ねる）', () => {
    expect(shouldAttemptAttendanceStats({ ...base, succeededThisBoot: true })).toBe(false)
  })

  describe('失敗後の再試行（v97の「一度失敗するとずっと取れない」を解消する核心）', () => {
    it('1回失敗しても間隔を空ければ再試行する（前面滞在中でも回復する）', () => {
      const s = { ...base, attempts: 1, lastAttemptAt: t0 }
      // 直後は待つ
      expect(shouldAttemptAttendanceStats({ ...s, now: t0 + 1 * MIN })).toBe(false)
      // 間隔経過後は取りに行く
      expect(shouldAttemptAttendanceStats({ ...s, now: t0 + ATTENDANCE_STATS_RETRY_INTERVAL_MS })).toBe(true)
    })

    it('間隔未満の連打はしない（CLASS負荷を増やさない）', () => {
      const s = { ...base, attempts: 1, lastAttemptAt: t0 }
      expect(shouldAttemptAttendanceStats({ ...s, now: t0 + ATTENDANCE_STATS_RETRY_INTERVAL_MS - 1 })).toBe(false)
    })

    it('最大回数に達したら打ち切る（毎回失敗する端末で無限リトライしない）', () => {
      const s = {
        ...base,
        attempts: ATTENDANCE_STATS_MAX_ATTEMPTS,
        lastAttemptAt: t0,
        now: t0 + 10 * ATTENDANCE_STATS_RETRY_INTERVAL_MS,
      }
      expect(shouldAttemptAttendanceStats(s)).toBe(false)
    })

    it('最大回数の1歩手前なら間隔経過で取りに行く', () => {
      const s = {
        ...base,
        attempts: ATTENDANCE_STATS_MAX_ATTEMPTS - 1,
        lastAttemptAt: t0,
        now: t0 + ATTENDANCE_STATS_RETRY_INTERVAL_MS,
      }
      expect(shouldAttemptAttendanceStats(s)).toBe(true)
    })
  })

  it('間隔と最大回数は現実的な値（負荷監査 130-170req/日 と整合）', () => {
    // 12分間隔・最大5回＝前面滞在中でも最大5回/約1時間で打ち切る
    expect(ATTENDANCE_STATS_RETRY_INTERVAL_MS).toBe(12 * MIN)
    expect(ATTENDANCE_STATS_MAX_ATTEMPTS).toBe(5)
  })
})
