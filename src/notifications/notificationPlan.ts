/**
 * 出席・課題締切前・朝まとめの3スケジューラを1つの通知枠（iOS保留64件上限）へ優先度配分する純粋関数。
 * 戦略書 `2026-07-04-free-first-strategy-design.md` 2章「見張り番の建付け確定 / 無料側の信頼性ガード」。
 *
 * tier（小さいほど優先）:
 *   0 = 出席アラーム（無料の必須通知。遠い発火でも守る）
 *   1 = 近接の課題締切前リマインダー（now から nearWindow 以内）
 *   2 = 近接の朝まとめ（当日/翌日）
 *   3 = far-future の課題締切前リマインダー
 *   4 = far-future の朝まとめ
 * far は枠が空いた分だけ残り、再予約（起動時/収集時）で近づくと tier が上がる＝ローリングで後貼りされる。
 * 端末非依存・now 注入で決定論的・非破壊。
 */
import { allocateNotificationSlots, type SlotRequest } from './slotAllocation'
import type { AttendanceAlarm } from './attendanceSchedule'
import type { ScheduledNotification, DeadlineReminder, MorningDigest } from './schedule'

export type NotificationPlan = {
  attendance: AttendanceAlarm[]
  assignments: ScheduledNotification[]
}

export type PlanOptions = {
  /** 予約枠の上限。iOS 64 の手前にバッファを取り既定60。 */
  cap?: number
  /** 「近接」とみなす now からの猶予（ms）。既定48時間。 */
  nearWindowMs?: number
}

const DEFAULT_CAP = 60
const DEFAULT_NEAR_WINDOW_MS = 48 * 60 * 60 * 1000

function attendanceId(a: AttendanceAlarm): string {
  return `att:${a.courseCode}:${a.kind}:${a.fireAt}`
}

function assignmentId(n: ScheduledNotification): string {
  return n.kind === 'morning-digest'
    ? `dig:${n.fireAt}`
    : `asg:${(n as DeadlineReminder).assignmentId}:${n.kind}`
}

export function planNotifications(
  attendanceAlarms: AttendanceAlarm[],
  assignmentNotifications: ScheduledNotification[],
  now: Date,
  options: PlanOptions = {},
): NotificationPlan {
  const cap = options.cap ?? DEFAULT_CAP
  const nearWindowMs = options.nearWindowMs ?? DEFAULT_NEAR_WINDOW_MS
  const nearCutoff = now.getTime() + nearWindowMs

  const requests: SlotRequest[] = []
  const attendanceById = new Map<string, AttendanceAlarm>()
  const assignmentById = new Map<string, ScheduledNotification>()

  for (const a of attendanceAlarms) {
    const id = attendanceId(a)
    attendanceById.set(id, a)
    requests.push({ id, fireAt: a.fireAt, priority: 0 })
  }

  for (const n of assignmentNotifications) {
    const id = assignmentId(n)
    assignmentById.set(id, n)
    const near = new Date(n.fireAt).getTime() <= nearCutoff
    const priority = n.kind === 'morning-digest' ? (near ? 2 : 4) : near ? 1 : 3
    requests.push({ id, fireAt: n.fireAt, priority })
  }

  const kept = allocateNotificationSlots(requests, cap)

  const attendance: AttendanceAlarm[] = []
  const assignments: ScheduledNotification[] = []
  for (const r of kept) {
    const a = attendanceById.get(r.id)
    if (a) {
      attendance.push(a)
      continue
    }
    const n = assignmentById.get(r.id)
    if (n) assignments.push(n)
  }
  return { attendance, assignments }
}
