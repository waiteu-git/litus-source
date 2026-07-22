/**
 * 通知予約の唯一の入口。出席・課題締切前・朝まとめを一括で読み込み、
 * planNotifications で iOS 64枠へ優先度配分してから expo-notifications に貼り直す。
 * 個別に予約すると全体枠を協調できず出席ナッジが押し出されうるため、経路をここへ一本化する。
 * トリガー: アプリ起動時／時間割・課題の収集完了時／出席アラーム設定変更時。
 */
import { loadTimetable } from '../storage/timetableStore'
import { isDemoNamespace } from '../storage/asyncStorage'
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
import { staggerSameInstant, DEFAULT_STAGGER_STEP_MS } from './staggerFireAt'
import type { ScheduledNotification } from './schedule'

/** 同一時刻グループ内の並び順を決めるキー（決定論のため種別ごとに安定した識別子を使う）。 */
function assignmentStaggerKey(n: ScheduledNotification): string {
  if (n.kind === 'morning-digest') return `dig:${n.fireAt}`
  if (n.kind === 'class-event') return `evt:${n.eventId}`
  return `asg:${n.assignmentId}:${n.kind}`
}

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
    // デモ中は OS の予約通知に触れない。触ると実ユーザーの出席アラーム・課題リマインダを
    // 全キャンセルして架空科目のものに差し替えてしまう（デモを抜けても再実行まで戻らない）。
    if (isDemoNamespace()) return
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
    // 優先度配分の後にずらす（配分の判断は元の時刻で行うのが正しい）。
    // 当日イベントは全て8:00固定、同一締切の課題、同一曜限に積まれた別科目の出席開始が
    // ミリ秒まで一致するため、そのまま貼るとヘッドアップと音が重なって読めない。
    await syncAttendanceAlarms(
      staggerSameInstant(
        plan.attendance,
        DEFAULT_STAGGER_STEP_MS,
        (a) => `${a.courseCode}:${a.kind}`,
      ),
    )
    await syncAssignmentReminders(
      staggerSameInstant(plan.assignments, DEFAULT_STAGGER_STEP_MS, assignmentStaggerKey),
    )
  },
)
