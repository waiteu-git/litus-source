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

/**
 * 各回イベント（休講/補講/小テスト/中間/期末/教室変更）の通知。課題リマインダーと同じ予約枠を
 * 共有するが、**文面は timetableEvents/eventSchedule が組み立て済み**なのでそのまま運ぶ。
 *
 * かつては kind:'deadline-24h' に潰して流していたため、assignmentContent が
 * 「締切まで24時間」「「◯◯ 休講（2026-07-20）」の締切が近づいています」という文面を作っていた。
 * 休講に締切は無く、発火は当日8:00で24時間でもない＝全イベント通知が事実と食い違っていた
 * （2026-07-17 修正）。**この型は文面を持ち回ることが存在理由なので、kind へ潰さないこと。**
 */
export type ClassEventNotice = {
  kind: 'class-event'
  /** 予約枠の識別に使う（eventSchedule が :eve / :day のサフィックスを付けた後のid）。 */
  eventId: string
  title: string
  body: string
  fireAt: string
}

export type ScheduledNotification = DeadlineReminder | MorningDigest | ClassEventNotice

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
      // 「今日締切」は**まとめが鳴る時点でまだ締め切られていないもの**だけ数える。
      // 同日判定だけだと当日3:00締切の課題を7:00のまとめが「今日締切 1件」として知らせてしまい、
      // その課題は4時間前に閉じている＝ユーザーは確認しに行って初めて空振りと分かる。
      // 締切前リマインダー(24h/3h/1h)は `fireMs <= now` で過去を落としているので、
      // まとめだけが過去の締切を通知していた（2026-07-17修正）。
      // 明日締切は丸一日先なので発火時刻より後であることが自明＝追加の判定は要らない。
      if (isSameLocalDate(dl, morning)) {
        if (dl.getTime() > morning.getTime()) dueToday++
      } else if (isSameLocalDate(dl, tomorrow)) dueTomorrow++
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
