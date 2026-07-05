/**
 * ローカル通知の予約スケジュールを計算する純粋関数。
 * 収集で判明した課題群と現在時刻から、締切前リマインダー（24h/3h/1h）と
 * 朝まとめ（毎朝・今日/明日締切の集計）を発火時刻付きで返す。
 * expo-notifications への予約はこの結果を使って別レイヤーが行う（本モジュールは純粋・端末非依存）。
 * 仕様: docs/superpowers/specs/2026-07-05-v2.0.0-app-initial-design.md セクション3。
 */

import type { AssignmentSubmissionStatus } from '../parsers/letus'

export type SchedulableAssignment = {
  id: string
  title: string
  deadline: string | null
  submissionStatus: AssignmentSubmissionStatus
}

export type DeadlineReminderKind = 'deadline-24h' | 'deadline-3h' | 'deadline-1h'

export type DeadlineReminder = {
  kind: DeadlineReminderKind
  assignmentId: string
  title: string
  fireAt: string
}

export type MorningDigest = {
  kind: 'morning-digest'
  fireAt: string
  dueToday: number
  dueTomorrow: number
}

export type ScheduledNotification = DeadlineReminder | MorningDigest

export type ScheduleOptions = {
  /** 朝まとめの発火時（ローカル）。既定7時。 */
  morningHour?: number
  /** 朝まとめの発火分（ローカル）。既定0分。 */
  morningMinute?: number
  /** 朝まとめを何日先まで予約するか。既定7日。 */
  digestDaysAhead?: number
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

const THRESHOLDS: { kind: DeadlineReminderKind; offsetMs: number }[] = [
  { kind: 'deadline-24h', offsetMs: 24 * HOUR_MS },
  { kind: 'deadline-3h', offsetMs: 3 * HOUR_MS },
  { kind: 'deadline-1h', offsetMs: 1 * HOUR_MS },
]

/** 締切があり、まだ提出/受験完了していない＝通知対象。 */
function needsAttention(a: SchedulableAssignment): boolean {
  if (!a.deadline) return false
  return a.submissionStatus !== 'submitted' && a.submissionStatus !== 'completed'
}

function isSameLocalDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function computeNotificationSchedule(
  assignments: SchedulableAssignment[],
  now: Date,
  options: ScheduleOptions = {},
): ScheduledNotification[] {
  const morningHour = options.morningHour ?? 7
  const morningMinute = options.morningMinute ?? 0
  const digestDaysAhead = options.digestDaysAhead ?? 7

  const targets = assignments.filter(needsAttention)
  const notifications: ScheduledNotification[] = []

  // 締切前リマインダー: 未来の発火時刻のみ
  for (const a of targets) {
    const deadlineMs = new Date(a.deadline as string).getTime()
    if (Number.isNaN(deadlineMs)) continue
    for (const { kind, offsetMs } of THRESHOLDS) {
      const fireMs = deadlineMs - offsetMs
      if (fireMs <= now.getTime()) continue
      notifications.push({
        kind,
        assignmentId: a.id,
        title: a.title,
        fireAt: new Date(fireMs).toISOString(),
      })
    }
  }

  // 朝まとめ: 各朝7:00に当日/翌日締切を集計。0件の朝は送らない。
  for (let i = 0; i < digestDaysAhead; i++) {
    const morning = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + i,
      morningHour,
      morningMinute,
      0,
      0,
    )
    if (morning.getTime() <= now.getTime()) continue

    const tomorrow = new Date(morning.getTime() + DAY_MS)
    let dueToday = 0
    let dueTomorrow = 0
    for (const a of targets) {
      const dl = new Date(a.deadline as string)
      if (Number.isNaN(dl.getTime())) continue
      if (isSameLocalDate(dl, morning)) dueToday++
      else if (isSameLocalDate(dl, tomorrow)) dueTomorrow++
    }
    if (dueToday + dueTomorrow === 0) continue

    notifications.push({
      kind: 'morning-digest',
      fireAt: morning.toISOString(),
      dueToday,
      dueTomorrow,
    })
  }

  notifications.sort(
    (x, y) => new Date(x.fireAt).getTime() - new Date(y.fireAt).getTime(),
  )
  return notifications
}
