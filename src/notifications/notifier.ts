/**
 * expo-notifications への予約/キャンセルを行う薄い端末層。
 * 判断ロジックは attendanceSchedule.ts（純粋）に置き、ここはI/Oのみ。
 * 注意: trigger 形は導入した expo-notifications 版のAPIに合わせて要確認（DATE トリガー）。
 */
import * as Notifications from 'expo-notifications'
import type { AttendanceAlarm } from './attendanceSchedule'
import { buildAttendanceNotificationContent } from './attendanceSchedule'

const TAG = 'attendance-alarm'

export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync()
  return status === 'granted'
}

export async function syncAttendanceAlarms(alarms: AttendanceAlarm[]): Promise<void> {
  // 既存の出席アラームを全キャンセルしてから貼り直す（差分管理せず単純化）。
  const scheduled = await Notifications.getAllScheduledNotificationsAsync()
  for (const n of scheduled) {
    const data = n.content.data as { tag?: string } | null
    if (data?.tag === TAG) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier)
    }
  }
  for (const alarm of alarms) {
    const { title, body } = buildAttendanceNotificationContent(alarm)
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { tag: TAG, courseCode: alarm.courseCode, kind: alarm.kind } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(alarm.fireAt) },
    })
  }
}
