/**
 * 出席・課題締切前・朝まとめの3スケジューラを1つの通知枠（iOS保留64件上限）へ優先度配分する純粋関数。
 * 戦略書 `2026-07-04-free-first-strategy-design.md` 2章「見張り番の建付け確定 / 無料側の信頼性ガード」。
 *
 * tier（小さいほど優先）:
 *   0 = 近接の出席アラーム（now から nearWindow 以内。無料の必須通知＝最優先で守る）
 *   1 = 近接の課題締切前リマインダー
 *   2 = 近接の朝まとめ（当日/翌日）
 *   3 = far-future の出席アラーム
 *   4 = far-future の課題締切前リマインダー
 *   5 = far-future の朝まとめ
 * far は枠が空いた分だけ残り、再予約（起動時/収集時）で近づくと tier が上がる＝ローリングで後貼りされる。
 * 端末非依存・now 注入で決定論的・非破壊。
 *
 * **出席も near/far で分ける理由（2026-07-17 修正・実測で全滅を確認）**:
 * 以前は出席アラームを発火時刻に無関係に一律 tier0 にしていた。その不変条件（「遠い発火でも守る」）は
 * **出席件数が枠に対して小さい**という暗黙の前提でしか成立せず、実データでは成立しない。
 * 出席は daysAhead=7 で「1週間 × 全コマ × 2通」生成されるため:
 *   単一学期5コマ×5日 → 出席50件が cap60 をほぼ占有し、課題34件のうち予約されるのは10件
 *   前期+後期4コマ×5日 → 出席80件で cap60 を使い切り、**課題通知が1通も予約されない**
 * しかも毎回7日分を tier0 で再生成するため残枠は常に 60−出席件数 に固定＝**何度 refresh しても
 * 自己修復しない**。LETUS課題締切のプッシュはこのアプリの看板機能であり、それが静かに全滅していた。
 * 「20日先の出席が今夜の締切1時間前より優先」は守る価値のある不変条件ではない。
 * near（既定48h）の出席は従来どおり最優先で守り、far の出席は課題より後ろへ下げる。
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
  if (n.kind === 'morning-digest') return `dig:${n.fireAt}`
  // 各回イベントのidは eventSchedule が :eve / :day を付与済みで、同一イベントの2段階でも別物になる。
  if (n.kind === 'class-event') return `evt:${n.eventId}`
  return `asg:${(n as DeadlineReminder).assignmentId}:${n.kind}`
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
    // 同一idの重複を弾く（前期・後期の両テーブルに同じ通年科目が同じ曜日時限で載っていると、
    // fireAt まで完全に同一のアラームが2件でき、そのまま同一文面が2回鳴る）。
    if (attendanceById.has(id)) continue
    attendanceById.set(id, a)
    const near = new Date(a.fireAt).getTime() <= nearCutoff
    requests.push({ id, fireAt: a.fireAt, priority: near ? 0 : 3 })
  }

  for (const n of assignmentNotifications) {
    const id = assignmentId(n)
    if (assignmentById.has(id)) continue
    assignmentById.set(id, n)
    const near = new Date(n.fireAt).getTime() <= nearCutoff
    // 各回イベント（休講/小テスト等）は締切リマインダーと同格に扱う（朝まとめより優先）。
    // 「明日休講」は見逃すと登校してしまう＝まとめ通知より取りこぼしの害が大きい。
    const priority = n.kind === 'morning-digest' ? (near ? 2 : 5) : near ? 1 : 4
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
