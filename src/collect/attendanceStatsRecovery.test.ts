import { describe, it, expect } from 'vitest'
import {
  shouldAttemptAttendanceStats,
  ATTENDANCE_STATS_RETRY_INTERVAL_MS,
  ATTENDANCE_STATS_MAX_ATTEMPTS,
} from './attendanceStatsRetry'

/**
 * 実機なしの検証: 出欠取得の状態機械を丸ごとシミュレートし、ユーザー報告
 * 「一度取得できないとずっと取得できない」が**修正後は起きない**ことを証明する。
 *
 * syncSession の可変状態と、トリガ（shouldAttemptAttendanceStats）・runner（started時カウント）・
 * エンジン完了（成功時のみ once-per-boot 確定）の相互作用を、実コードの遷移規則そのままで再現する。
 * v97 のバグ（成否問わず once-per-boot を立てる）を意図的に切り替えられるようにして、
 * 「修正前は固着・修正後は回復」を対比で示す。
 */

// syncSession 相当の可変状態（プロセス内）。
type Session = {
  succeededThisBoot: boolean
  attempts: number
  lastAttemptAt: number | null
}

const fresh = (): Session => ({ succeededThisBoot: false, attempts: 0, lastAttemptAt: null })

/** runner: 背景トリガが started したときのカウント記録（SyncProvider の実装と同じ）。 */
function onStarted(s: Session, now: number) {
  s.attempts += 1
  s.lastAttemptAt = now
}

/**
 * エンジン完了。succeeded と、バグ再現フラグ buggyUnconditional を受ける。
 * - 修正版: 成功時のみ once-per-boot 確定＋カウントリセット。失敗は触らない。
 * - v97バグ版: 成否問わず once-per-boot を立てる（buggyUnconditional=true）。
 */
function onFinished(s: Session, succeeded: boolean, buggyUnconditional: boolean) {
  if (buggyUnconditional) {
    s.succeededThisBoot = true
    return
  }
  if (succeeded) {
    s.succeededThisBoot = true
    s.attempts = 0
  }
}

/**
 * 前面滞在中の時間経過をシミュレートする。tick ごとに shouldAttempt を評価し、true なら
 * runner started → エンジン完了（collectSucceeds が返す成否）まで進める。
 * collectSucceeds(attemptIndex) で「何回目の試行で成功するか」を制御する。
 * 授業外・オンライン・非競合を仮定（runner の decideClassSync は通る前提＝トリガ層の検証に集中）。
 */
function simulateForeground(opts: {
  durationMs: number
  stepMs: number
  collectSucceeds: (attemptIndex: number) => boolean
  buggyUnconditional: boolean
}): { session: Session; successes: number; attempts: number } {
  const s = fresh()
  let successes = 0
  let attemptIndex = 0
  for (let now = 0; now <= opts.durationMs; now += opts.stepMs) {
    const attempt = shouldAttemptAttendanceStats({
      succeededThisBoot: s.succeededThisBoot,
      attempts: s.attempts,
      lastAttemptAt: s.lastAttemptAt,
      now,
    })
    if (!attempt) continue
    onStarted(s, now)
    const succeeded = opts.collectSucceeds(attemptIndex)
    attemptIndex += 1
    if (succeeded) successes += 1
    onFinished(s, succeeded, opts.buggyUnconditional)
  }
  return { session: s, successes, attempts: s.attempts + (s.succeededThisBoot ? 0 : 0) }
}

const HOUR = 60 * 60 * 1000
const MIN = 60 * 1000

describe('v97バグの再現（対照群）: 失敗で once-per-boot が立つと前面滞在中は二度と取りに行かない', () => {
  it('起動直後に1回失敗すると、以後6時間開きっぱなしでも一度も再試行しない', () => {
    const r = simulateForeground({
      durationMs: 6 * HOUR,
      stepMs: 1 * MIN,
      collectSucceeds: () => false, // 毎回失敗する状況
      buggyUnconditional: true, // ← v97 のバグ
    })
    // 最初の1回だけ試行し、once-per-boot が立って以後死ぬ＝ユーザー報告の症状
    expect(r.session.attempts).toBe(1)
    expect(r.session.succeededThisBoot).toBe(true) // 失敗なのに「完了」扱い
    expect(r.successes).toBe(0)
  })
})

describe('修正後: 失敗しても間隔を空けて自動再試行し、回復できる', () => {
  it('毎回失敗する状況では、6時間で最大回数（5回）まで再試行して打ち切る', () => {
    const r = simulateForeground({
      durationMs: 6 * HOUR,
      stepMs: 1 * MIN,
      collectSucceeds: () => false,
      buggyUnconditional: false, // ← 修正版
    })
    expect(r.session.attempts).toBe(ATTENDANCE_STATS_MAX_ATTEMPTS) // 1回で死なず5回試す
    expect(r.session.succeededThisBoot).toBe(false) // 失敗を「完了」にしない
    expect(r.successes).toBe(0)
  })

  it('3回目の試行で回復する状況では、実際に成功へ到達する（ずっと取れないが起きない）', () => {
    const r = simulateForeground({
      durationMs: 6 * HOUR,
      stepMs: 1 * MIN,
      collectSucceeds: (i) => i >= 2, // 3回目（index2）以降は成功
      buggyUnconditional: false,
    })
    expect(r.successes).toBeGreaterThanOrEqual(1)
    expect(r.session.succeededThisBoot).toBe(true)
    // 成功でカウントがリセットされる
    expect(r.session.attempts).toBe(0)
  })

  it('再試行は12分間隔を守る（1回目失敗の直後に連打しない）', () => {
    // 30分だけ回す。12分間隔なら 0分・12分・24分 の3回試行できる
    const r = simulateForeground({
      durationMs: 30 * MIN,
      stepMs: 1 * MIN,
      collectSucceeds: () => false,
      buggyUnconditional: false,
    })
    expect(r.session.attempts).toBe(3)
  })

  it('初回で成功すれば以後この起動では再取得しない（鮮度TTLに委ねる）', () => {
    const r = simulateForeground({
      durationMs: 6 * HOUR,
      stepMs: 1 * MIN,
      collectSucceeds: () => true, // 初回から成功
      buggyUnconditional: false,
    })
    expect(r.successes).toBe(1)
    expect(r.session.succeededThisBoot).toBe(true)
  })
})

describe('フォアグラウンド復帰でリセットされれば、打ち切り後でも再挑戦できる', () => {
  it('最大回数まで失敗した後、復帰リセットを挟むと再び取りに行ける', () => {
    // 前半: 打ち切りまで失敗
    const s = fresh()
    for (let now = 0; now <= 2 * HOUR; now += 1 * MIN) {
      if (
        shouldAttemptAttendanceStats({
          succeededThisBoot: s.succeededThisBoot,
          attempts: s.attempts,
          lastAttemptAt: s.lastAttemptAt,
          now,
        })
      ) {
        onStarted(s, now)
        onFinished(s, false, false)
      }
    }
    expect(s.attempts).toBe(ATTENDANCE_STATS_MAX_ATTEMPTS) // 打ち切り

    // 復帰リセット（BackgroundAttendanceStatsSync の subscribeForeground と同じ）
    s.succeededThisBoot = false
    s.attempts = 0
    s.lastAttemptAt = null

    // 復帰後は再び取りに行ける
    const canRetry = shouldAttemptAttendanceStats({
      succeededThisBoot: s.succeededThisBoot,
      attempts: s.attempts,
      lastAttemptAt: s.lastAttemptAt,
      now: 2 * HOUR + 1 * MIN,
    })
    expect(canRetry).toBe(true)
  })
})
