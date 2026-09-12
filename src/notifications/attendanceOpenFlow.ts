/**
 * 受付open と出席済みの取り下げの配線（RN 層・N1 §4.3・§4.4）。判断と順番は attendanceOpenSequence.ts（純粋層）。
 * ここは notifier とストアの関数を渡して呼ぶだけ。notifier を import するので vitest からは読めない
 * （配線は attendanceWiring.test.ts がソースで固定する）。
 */
import { isDemoNamespace } from '../storage/asyncStorage'
import { loadAttendanceSettings } from '../storage/attendanceSettingsStore'
import { loadNotifiedAttendanceOpen, mutateNotifiedAttendanceOpen } from '../storage/notifiedAttendanceOpenStore'
import { addAnnouncedSlot } from '../storage/announcedSlotsStore'
import { loadTimetable } from '../storage/timetableStore'
import {
  cancelScheduledNotification,
  clearDeliveredAttendanceStartNotifications,
  dismissPresentedAttendanceByIds,
  getPresentedNotificationsSnapshot,
  presentAttendanceOpenNotification,
} from './notifier'
import { courseCodeByName } from './attendanceOpenNotify'
import { todaySlotNotices, type AttendanceAlarmSettings } from './attendanceSchedule'
import { runAttendanceOpenSequence, runAttendedRetraction } from './attendanceOpenSequence'
import { enqueueAttendanceNotif, markRetracted } from './attendanceNotifState'
import { todayKey, type AttendedRecord } from '../attendance/attendedState'
import type { AttendanceReception } from '../collect/attendanceMessage'
import type { TimetableCollection } from '../collect/timetableMessage'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * 受付open の通知（旧 AttendanceEngineProvider.tsx:835-863 の置き換え）。受付中（accepting）以外・デモ中は何もしない。
 * 科目別OFF（設定画面「出席アラーム（科目別）」）を受付open通知にも効かせる。設定は courseCode 鍵・受付は科目名しか
 * 持たないので時間割で橋渡しし、引けなければ「OFFでない」＝通知する側に倒す（黙って通知を殺さない）。
 */
export async function announceAttendanceOpen(args: {
  rec: AttendanceReception
  now: Date
  timetable: TimetableCollection[]
  attendedNow: boolean
  attendanceFocused: boolean
}): Promise<void> {
  const { rec, now, timetable } = args
  if (rec.status !== 'accepting' || isDemoNamespace()) return
  const courseCode = courseCodeByName(timetable, rec.courseName)
  const settings: AttendanceAlarmSettings = await loadAttendanceSettings().catch(() => ({}))
  await runAttendanceOpenSequence(
    {
      loadNotified: loadNotifiedAttendanceOpen,
      mutateNotified: mutateNotifiedAttendanceOpen,
      todayNotices: () => todaySlotNotices(timetable, now),
      enqueue: enqueueAttendanceNotif,
      getPresented: getPresentedNotificationsSnapshot,
      present: presentAttendanceOpenNotification,
      cancelScheduled: cancelScheduledNotification,
      clearDeliveredStart: clearDeliveredAttendanceStartNotifications,
      recordAnnounced: (slotId) => addAnnouncedSlot(slotId, todayKey(now)).then(() => undefined),
      sleep,
      clock: () => Date.now(),
    },
    {
      status: rec.status,
      courseName: rec.courseName,
      confirmWindow: rec.confirmWindow,
      now,
      attendedNow: args.attendedNow,
      attendanceFocused: args.attendanceFocused,
      courseCode,
      courseDisabled: courseCode ? settings[courseCode] === false : false,
    },
  )
}

/**
 * 出席済みのコマの開始・終了前を取り下げる（§4.4）。デモ中は OS の予約に触れない（notificationRefresh と同じ判定）。
 * 🔴 時間割は画面の state でなく保存から読む（記録の読み込みが時間割より先に終わると、空の時間割で照合して何も消せない）。
 */
export async function retractAttendedSlots(args: { rec: AttendedRecord | null; now: Date }): Promise<void> {
  if (isDemoNamespace()) return
  await runAttendedRetraction(
    {
      enqueue: enqueueAttendanceNotif,
      todayNotices: async () => todaySlotNotices((await loadTimetable()) ?? [], args.now),
      markRetracted,
      cancelScheduled: cancelScheduledNotification,
      dismissPresented: dismissPresentedAttendanceByIds,
    },
    args,
  )
}
