/**
 * expo-notifications への予約/キャンセルを行う薄い端末層。
 * 判断ロジックは attendanceSchedule.ts（純粋）に置き、ここはI/Oのみ。
 *
 * Expo Go(SDK53+)では expo-notifications がモジュール読み込み時点で例外を投げる
 * （Android push が Expo Go から削除されたため）。静的 import すると起動時にアプリごと
 * クラッシュするので、**遅延 import（dynamic import）＋try/catch** でロードする。
 * ロードできない環境（Expo Go）では通知系は no-op になり、他機能（時間割・出席WebView・
 * 設定）は動く。**実際の通知発火の検証は開発ビルド（expo run:android / EAS dev build）が必要。**
 */
import type { AttendanceAlarm } from './attendanceSchedule'
import { buildAttendanceNotificationContent } from './attendanceSchedule'

const TAG = 'attendance-alarm'

type NotificationsModule = typeof import('expo-notifications')

let cached: NotificationsModule | null | undefined

/** expo-notifications を遅延ロードする。Expo Goなど利用不可な環境では null。 */
async function loadNotifications(): Promise<NotificationsModule | null> {
  if (cached !== undefined) return cached
  try {
    cached = await import('expo-notifications')
  } catch (e) {
    console.warn(
      '通知モジュールを利用できません（Expo Goでは通知は動作しません。開発ビルドが必要です）',
      e,
    )
    cached = null
  }
  return cached
}

export async function requestNotificationPermission(): Promise<boolean> {
  const Notifications = await loadNotifications()
  if (!Notifications) return false
  const { status } = await Notifications.requestPermissionsAsync()
  return status === 'granted'
}

export async function syncAttendanceAlarms(alarms: AttendanceAlarm[]): Promise<void> {
  const Notifications = await loadNotifications()
  if (!Notifications) return
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
