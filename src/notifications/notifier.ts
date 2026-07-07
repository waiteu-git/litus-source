/**
 * expo-notifications への予約/キャンセルを行う薄い端末層。
 * 判断ロジックは attendanceSchedule.ts（純粋）に置き、ここはI/Oのみ。
 *
 * Expo Go(SDK53+)では expo-notifications がモジュール評価時に例外を投げる
 * （Android push が Expo Go から削除され、`DevicePushTokenAutoRegistration` の
 * トップレベル副作用が throw する）。遅延 import でも「読み込めば落ちる」ため、
 * **Expo Go では expo-notifications を一切ロードしない**。判定は expo-constants の
 * executionEnvironment（StoreClient = Expo Go）で行う。
 * Expo Go では通知系は no-op になり、他機能（時間割・出席WebView・設定）は動く。
 * **実際の通知発火の検証は開発ビルド（expo run:android / EAS dev build）が必要。**
 */
import { Platform } from 'react-native'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import type { AttendanceAlarm } from './attendanceSchedule'
import { buildAttendanceNotificationContent } from './attendanceSchedule'
import type { ScheduledNotification } from './schedule'
import { buildAssignmentNotificationContent } from './assignmentContent'

const TAG = 'attendance-alarm'
const ASSIGNMENT_TAG = 'assignment-reminder'

export const ATTENDANCE_CHANNEL_ID = 'attendance'
export const ASSIGNMENT_CHANNEL_ID = 'assignments'

/** Expo Go では expo-notifications を読み込めない（読むと落ちる）。 */
const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient

type NotificationsModule = typeof import('expo-notifications')

let cached: NotificationsModule | null | undefined

/** expo-notifications を遅延ロードする。Expo Go では読み込まず null（no-op）。 */
async function loadNotifications(): Promise<NotificationsModule | null> {
  if (cached !== undefined) return cached
  if (IS_EXPO_GO) {
    console.warn('Expo Goでは通知は動作しません（実発火の確認には開発ビルドが必要です）')
    cached = null
    return cached
  }
  try {
    cached = await import('expo-notifications')
  } catch (e) {
    console.warn('通知モジュールを利用できませんでした', e)
    cached = null
  }
  return cached
}

/**
 * 通知の表示方針とAndroidチャンネルを設定する。App起動時に権限要求より先に1回呼ぶ。
 * ハンドラ未設定だとフォアグラウンド中の通知が一切表示されない（授業直前にアプリを
 * 開いていると出席ナッジが消える）ため必須。チャンネルは出席=MAX（音＋ヘッドアップ）、
 * 課題=HIGH。Expo Go では loadNotifications が null を返し no-op。
 */
export async function configureNotifications(): Promise<void> {
  const Notifications = await loadNotifications()
  if (!Notifications) return
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  })
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ATTENDANCE_CHANNEL_ID, {
      name: '出席リマインド',
      importance: Notifications.AndroidImportance.MAX,
    })
    await Notifications.setNotificationChannelAsync(ASSIGNMENT_CHANNEL_ID, {
      name: '課題リマインド',
      importance: Notifications.AndroidImportance.HIGH,
    })
  }
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
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(alarm.fireAt),
        channelId: ATTENDANCE_CHANNEL_ID,
      },
    })
  }
}

/** 課題の締切前リマインダー＋朝まとめを貼り直す（既存の課題通知を全キャンセルしてから予約）。 */
export async function syncAssignmentReminders(notifications: ScheduledNotification[]): Promise<void> {
  const Notifications = await loadNotifications()
  if (!Notifications) return
  const scheduled = await Notifications.getAllScheduledNotificationsAsync()
  for (const n of scheduled) {
    const data = n.content.data as { tag?: string } | null
    if (data?.tag === ASSIGNMENT_TAG) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier)
    }
  }
  for (const n of notifications) {
    const { title, body } = buildAssignmentNotificationContent(n)
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { tag: ASSIGNMENT_TAG, kind: n.kind } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(n.fireAt),
        channelId: ASSIGNMENT_CHANNEL_ID,
      },
    })
  }
}
