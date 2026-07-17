/**
 * 通知予約の唯一の入口。出席・課題締切前・朝まとめを一括で読み込み、
 * planNotifications で iOS 64枠へ優先度配分してから expo-notifications に貼り直す。
 * 個別に予約すると全体枠を協調できず出席ナッジが押し出されうるため、経路をここへ一本化する。
 * トリガー: アプリ起動時／時間割・課題の収集完了時／出席アラーム設定変更時。
 */
import { loadTimetable } from '../storage/timetableStore'
import { loadAttendanceSettings } from '../storage/attendanceSettingsStore'
import { computeAttendanceAlarms, type CancelledClass } from './attendanceSchedule'
import { loadAssignments } from '../storage/assignmentsStore'
import { computeNotificationSchedule, type SchedulableAssignment } from './schedule'
import { planNotifications } from './notificationPlan'
import { syncAttendanceAlarms, syncAssignmentReminders } from './notifier'
import type { AssignmentMap } from '../storage/assignmentsSerialize'
import { loadClassEvents } from '../storage/classEventsStore'
// 変換は純粋層（classEventNotify）に置いてテストで固定する。このファイルはストア（AsyncStorage）を
// 引き込むため vitest から読めず、ここに変換を書くとテストの穴になる（実際にそれで文面が壊れていた）。
import { classEventNotifications } from './classEventNotify'
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


/**
 * 直列化: 起動時/AppState復帰/収集完了/設定変更から多重発火するため、素のまま並走させると
 * getAllScheduled→cancel→再予約が非アトミックに交錯し二重予約・取りこぼしが起きる。
 * serializeRuns で1本ずつ実行し、実行中に重なった要求は完了後の1回に合流させる。
 */
export const refreshAllNotifications: (now?: Date) => Promise<void> = serializeRuns(
  async (now: Date = new Date()): Promise<void> => {
    const collections = await loadTimetable()
    const settings = await loadAttendanceSettings()
    const classEvents = await loadClassEvents()
    // 休講登録済みのコマには出席アラームを出さない。渡さないと同じ日に「◯◯ 休講」と
    // 「◯◯ 出席コード」が両方届き、ホームの休講タグとも食い違う（2026-07-17修正）。
    const cancelled: CancelledClass[] = classEvents
      .filter((e) => e.type === 'cancel')
      .map((e) => ({
        date: e.date,
        periods: e.periods,
        courseCode: e.courseCode,
        courseName: e.courseName,
      }))
    const attendanceAlarms = collections
      ? computeAttendanceAlarms(collections, settings, now, {}, cancelled)
      : []

    const assignmentMap = await loadAssignments()
    const assignmentNotifications = computeNotificationSchedule(toSchedulable(assignmentMap), now)

    const eventNotifications = classEventNotifications(classEvents, now)

    const plan = planNotifications(attendanceAlarms, [...assignmentNotifications, ...eventNotifications], now)
    await syncAttendanceAlarms(plan.attendance)
    await syncAssignmentReminders(plan.assignments)
  },
)
