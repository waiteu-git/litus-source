/**
 * 通知予約の唯一の入口。出席・課題締切前・朝まとめを一括で読み込み、
 * planNotifications で iOS 64枠へ優先度配分してから expo-notifications に貼り直す。
 * 個別に予約すると全体枠を協調できず出席ナッジが押し出されうるため、経路をここへ一本化する。
 * トリガー: アプリ起動時／時間割・課題の収集完了時／出席アラーム設定変更時。
 */
import { loadTimetable } from '../storage/timetableStore'
import { loadAttendanceSettings } from '../storage/attendanceSettingsStore'
import { computeAttendanceAlarms } from './attendanceSchedule'
import { loadAssignments } from '../storage/assignmentsStore'
import { computeNotificationSchedule, type SchedulableAssignment, type ScheduledNotification } from './schedule'
import { planNotifications } from './notificationPlan'
import { syncAttendanceAlarms, syncAssignmentReminders } from './notifier'
import type { AssignmentMap } from '../storage/assignmentsSerialize'
import { loadClassEvents } from '../storage/classEventsStore'
import { buildClassEventNotifications } from '../timetableEvents/eventSchedule'
import type { ClassEvent } from '../timetableEvents/classEvent'
import { serializeRuns } from './serializeRuns'

function toSchedulable(map: AssignmentMap): SchedulableAssignment[] {
  return Object.values(map)
    .filter((a) => !a.ignored)
    .map((a) => ({
      id: a.url,
      title: a.title,
      deadline: a.deadline,
      submissionStatus: a.submissionStatus,
    }))
}

/** 各回イベントの通知を、課題リマインダーと同じ通知枠へ流すため ScheduledNotification 形状に変換する。 */
function classEventNotifications(events: ClassEvent[], now: Date): ScheduledNotification[] {
  return buildClassEventNotifications(events, now).map((n) => ({
    kind: 'deadline-24h',
    assignmentId: `evt:${n.id}`,
    title: n.body ? `${n.title}（${n.body}）` : n.title,
    fireAt: n.fireAt.toISOString(),
  }))
}

/**
 * 直列化: 起動時/AppState復帰/収集完了/設定変更から多重発火するため、素のまま並走させると
 * getAllScheduled→cancel→再予約が非アトミックに交錯し二重予約・取りこぼしが起きる。
 * serializeRuns で1本ずつ実行し、実行中に重なった要求は完了後の1回に合流させる。
 */
export const refreshAllNotifications: (now?: Date) => Promise<void> = serializeRuns(
  async (now: Date = new Date()): Promise<void> => {
    const collections = await loadTimetable()
    const settings = await loadAttendanceSettings()
    const attendanceAlarms = collections ? computeAttendanceAlarms(collections, settings, now) : []

    const assignmentMap = await loadAssignments()
    const assignmentNotifications = computeNotificationSchedule(toSchedulable(assignmentMap), now)

    const classEvents = await loadClassEvents()
    const eventNotifications = classEventNotifications(classEvents, now)

    const plan = planNotifications(attendanceAlarms, [...assignmentNotifications, ...eventNotifications], now)
    await syncAttendanceAlarms(plan.attendance)
    await syncAssignmentReminders(plan.assignments)
  },
)
