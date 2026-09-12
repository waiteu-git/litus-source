/**
 * 出席の予約集合と、差分同期の判断（純粋・RN非依存・N1 §4.1・§4.2）。
 * notifier.ts は vitest から読めない（notificationTags.ts の冒頭）ので、判断はここに置いてテストで固定する。
 * 設計: docs/design/2026-09-12-v11-train1-N1.md
 */
import { ATTENDANCE_TAG } from './notificationTags'
import type { NotificationPayload } from './notificationRoute'
import {
  buildAttendanceNoticeContent,
  excludeNotices,
  type AttendanceNotice,
  type NoticeTitleContext,
} from './attendanceSchedule'
import { planNotifications, type NotificationPlan } from './notificationPlan'
import type { ScheduledNotification } from './schedule'

/**
 * 出席の予約集合（除外の後に、課題と同じ60枠へ優先度配分する）。貼り直し（notificationRefresh）はこれを使う。
 * 除外（受付open 済み＝M4・出席済み＝M5）は、出席の直列キューの中で読み直した集合を渡すこと（§4.5）。
 */
export function planAttendanceNotices(input: {
  notices: readonly AttendanceNotice[]
  others: readonly ScheduledNotification[]
  now: Date
  excluded: ReadonlySet<string>
}): NotificationPlan<AttendanceNotice> {
  return planNotifications(excludeNotices(input.notices, input.excluded), [...input.others], input.now, {}, (n) => n.id)
}

/** 同じ identifier が保留にある時、発火までこれ未満なら触らない（予約し直すと、発火と競って過去の時刻になった時に Android は保留ごと消す）。 */
export const MIN_LEAD_MS = 10_000
/** 保留に無い時、発火までこれ未満なら予約しない（iOS は秒へ切り捨ててから予約するので、近いと reject になる）。 */
export const MIN_NEW_MS = 2_000

/**
 * 予約してよいか（§4.2）。fireAt は**ずらした後**の値、nowMs は**予約の直前**に取り直した値を渡す。
 * 保留については identifier の有無（isPending）だけを見る＝保留の発火時刻は使わない（iOS は保留から時刻を読めない）。
 */
export function isSchedulable(fireAtIso: string, nowMs: number, isPending: boolean): boolean {
  const at = new Date(fireAtIso).getTime()
  if (Number.isNaN(at)) return false
  return at - nowMs >= (isPending ? MIN_LEAD_MS : MIN_NEW_MS)
}

/**
 * 出席の差分同期の計画（§4.2）。
 * cancel＝保留の出席のうち今回の集合に無い identifier（時刻を問わない）。旧版の uuid はここで全部消える＝移行。
 * 空の集合なら全部（キルスイッチ all の出口）。schedule＝今回の集合のうち isSchedulable を満たすもの。
 */
export function planAttendanceSync<T extends { id: string; fireAt: string }>(
  pendingIds: readonly string[],
  desired: readonly T[],
  nowMs: number,
): { cancel: string[]; schedule: T[] } {
  const want = new Set(desired.map((d) => d.id))
  const pending = new Set(pendingIds)
  return {
    cancel: [...pending].filter((id) => !want.has(id)),
    schedule: desired.filter((d) => isSchedulable(d.fireAt, nowMs, pending.has(d.id))),
  }
}

export type LoopResult = { scheduled: number; skipped: number; failed: number }

/**
 * 1件ずつの予約ループ（§4.2）。現在時刻は1件ごとに取り直し、失敗は数えて先へ進む。
 * 以前は1件の reject でループごと止まり、それ以降の予約が全部消えていた（iOS の過去時刻・§3）。
 */
export async function runScheduleLoop<T extends { fireAt: string }>(
  items: readonly T[],
  io: { isPending: (item: T) => boolean; clock: () => number; schedule: (item: T) => Promise<unknown> },
): Promise<LoopResult> {
  const r: LoopResult = { scheduled: 0, skipped: 0, failed: 0 }
  for (const x of items) {
    if (!isSchedulable(x.fireAt, io.clock(), io.isPending(x))) {
      r.skipped++
      continue
    }
    try {
      await io.schedule(x)
      r.scheduled++
    } catch {
      r.failed++
    }
  }
  return r
}

/** 保留中の予約の写し（expo の NotificationRequest から identifier と data だけを取ったもの）。 */
export type PendingRequestLike = { identifier: string; data: Record<string, unknown> | null }

export type AttendanceSyncResult = LoopResult & { cancelled: number; cancelFailed: number }

/**
 * 出席の差分同期の組み立て（§4.2）。notifier はこれに expo の関数を渡すだけ。
 * 出席タグ以外の保留には触らない。取り消し → 予約の順。同じ identifier の予約は置き換えになるので重複しない。
 */
export async function syncAttendanceWith<T extends { id: string; fireAt: string }>(
  desired: readonly T[],
  io: {
    getPending: () => Promise<PendingRequestLike[]>
    cancel: (identifier: string) => Promise<void>
    schedule: (item: T) => Promise<unknown>
    clock: () => number
  },
): Promise<AttendanceSyncResult> {
  const pendingIds = (await io.getPending()).filter((p) => p.data?.tag === ATTENDANCE_TAG).map((p) => p.identifier)
  const plan = planAttendanceSync(pendingIds, desired, io.clock())
  let cancelled = 0
  let cancelFailed = 0
  for (const id of plan.cancel) {
    try {
      await io.cancel(id)
      cancelled++
    } catch {
      cancelFailed++
    }
  }
  const pending = new Set(pendingIds)
  const loop = await runScheduleLoop(plan.schedule, {
    isPending: (x) => pending.has(x.id),
    clock: io.clock,
    schedule: io.schedule,
  })
  return { ...loop, skipped: loop.skipped + (desired.length - plan.schedule.length), cancelled, cancelFailed }
}

/** 出席の予約1件（題名・本文・payload まで決めたもの）。fireAt はずらした後＝実際に予約する時刻。 */
export type AttendanceScheduleItem = {
  id: string
  fireAt: string
  title: string
  body: string
  data: NotificationPayload
}

/**
 * まとめた枠（ずらした後）を予約項目にする（§4.7）。payload は courseCode・kind を残し、
 * courseCodes・courseNames・date・span・fireAt を足す。タップの着地はタグだけで決まる（notificationRoute.ts）。
 */
export function toAttendanceScheduleItems(
  notices: readonly AttendanceNotice[],
  ctx: NoticeTitleContext,
): AttendanceScheduleItem[] {
  return notices.map((n) => {
    const { title, body } = buildAttendanceNoticeContent(n, ctx)
    return {
      id: n.id,
      fireAt: n.fireAt,
      title,
      body,
      data: {
        tag: ATTENDANCE_TAG,
        kind: n.kind,
        courseCode: n.courses[0]?.courseCode,
        courseCodes: n.courses.map((c) => c.courseCode),
        courseNames: n.courses.map((c) => c.courseName),
        date: n.date,
        span: n.span,
        fireAt: n.fireAt,
      },
    }
  })
}
