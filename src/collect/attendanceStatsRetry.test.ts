import { describe, it, expect } from 'vitest'
import {
  shouldAttemptAttendanceStats,
  ATTENDANCE_STATS_RETRY_INTERVAL_MS,
  ATTENDANCE_STATS_MAX_ATTEMPTS,
  ATTENDANCE_STATS_MAX_LIFETIME_ATTEMPTS,
} from './attendanceStatsRetry'

const MIN = 60 * 1000
const t0 = 1_700_000_000_000

const base = {
  succeededThisBoot: false,
  attempts: 0,
  lastAttemptAt: null as number | null,
  lifetimeAttempts: 0,
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

  describe('プロセス寿命の累積上限（復帰リセットで解除されない負荷天井）', () => {
    // per-boot の attempts/lastAttemptAt は復帰でゼロに戻る＝復帰直後の1回は間隔ゲート無しで即発火
    // しうる。病的な連続出し入れを繰り返すと、リセットのたびに throttle ゼロで CLASS を叩ける。
    // これを有界化するのが lifetimeAttempts の累積上限（復帰でも成功でもリセットしない）。
    it('累積試行が天井に達したら、per-boot も間隔も開いていて未成功でも取りに行かない', () => {
      const s = {
        ...base,
        succeededThisBoot: false, // 未成功
        attempts: 0, // 復帰リセット直後（per-boot は開いている）
        lastAttemptAt: null, // 間隔ゲートも開いている
        lifetimeAttempts: ATTENDANCE_STATS_MAX_LIFETIME_ATTEMPTS, // 生涯上限に到達
        now: t0 + 100 * ATTENDANCE_STATS_RETRY_INTERVAL_MS,
      }
      expect(shouldAttemptAttendanceStats(s)).toBe(false)
    })

    it('天井の1歩手前なら（per-boot・間隔が開いていれば）取りに行く', () => {
      const s = { ...base, lifetimeAttempts: ATTENDANCE_STATS_MAX_LIFETIME_ATTEMPTS - 1 }
      expect(shouldAttemptAttendanceStats(s)).toBe(true)
    })

    it('天井は「数十回」＝正常利用では当たらず病的操作だけを有界化する値', () => {
      expect(ATTENDANCE_STATS_MAX_LIFETIME_ATTEMPTS).toBe(50)
    })
  })
})
