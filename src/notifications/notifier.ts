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
import type { BulletinItem } from '../storage/bulletinDigestSerialize'
import { buildBulletinNotificationContent } from './bulletinNotify'

const TAG = 'attendance-alarm'
const ASSIGNMENT_TAG = 'assignment-reminder'
/** 各回イベント（休講/補講/小テスト等）。予約枠は課題と共有するが分類とタップ先が別。 */
export const CLASS_EVENT_TAG = 'class-event'
export const BULLETIN_TAG = 'bulletin-new'
export const ATTENDANCE_OPEN_TAG = 'attendance-open'
export const LETUS_NEWS_TAG = 'letus-news'

export const ATTENDANCE_CHANNEL_ID = 'attendance'
export const ASSIGNMENT_CHANNEL_ID = 'assignments'
export const BULLETIN_CHANNEL_ID = 'bulletins'
export const LETUS_NEWS_CHANNEL_ID = 'letus-updates'
/**
 * 各回イベント（休講/補講/小テスト/教室変更）専用チャンネル。
 * 予約枠は課題と共有するが、**通知の性質が別物**なので OS 上の分類は分ける。
 * 同居していた頃は「休講」がOS設定で『課題リマインド』に属し、課題通知を切ると休講も消え、
 * 逆に休講だけ切ることもできなかった（2026-07-17修正）。
 */
export const CLASS_EVENT_CHANNEL_ID = 'class-events'

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
    await Notifications.setNotificationChannelAsync(CLASS_EVENT_CHANNEL_ID, {
      name: '休講・補講・小テスト',
      importance: Notifications.AndroidImportance.HIGH,
    })
    await Notifications.setNotificationChannelAsync(BULLETIN_CHANNEL_ID, {
      name: '新着掲示',
      importance: Notifications.AndroidImportance.HIGH,
    })
    await Notifications.setNotificationChannelAsync(LETUS_NEWS_CHANNEL_ID, {
      name: 'LETUS更新',
      importance: Notifications.AndroidImportance.HIGH,
    })
  }
}

type NotifResponseData = { tag?: string; courseCode?: string; kind?: string }

function tagOf(resp: { notification: { request: { content: { data?: unknown } } } } | null | undefined): string | null {
  const data = resp?.notification.request.content.data as NotifResponseData | undefined
  return typeof data?.tag === 'string' ? data.tag : null
}

/**
 * アプリを起動した通知タップ（cold start）の tag を返す。無ければ null。
 * Expo Go では通知モジュールを読み込めないため null。
 */
export async function getInitialNotificationTag(): Promise<string | null> {
  const Notifications = await loadNotifications()
  if (!Notifications) return null
  return tagOf(await Notifications.getLastNotificationResponseAsync())
}

/**
 * 通知タップ（warm）を購読する。コールバックにはタップされた通知の tag を渡す。
 * Expo Go では no-op（null を返す）。
 */
export async function addNotificationResponseListener(
  cb: (tag: string | null) => void,
): Promise<{ remove: () => void } | null> {
  const Notifications = await loadNotifications()
  if (!Notifications) return null
  return Notifications.addNotificationResponseReceivedListener((resp) => cb(tagOf(resp)))
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
    // 各回イベントは別タグ・別チャンネルへ分けたが、予約はこの関数が一括で貼り直す。
    // **両方のタグを掃除すること**（片方だけだと分離前に貼った予約や、イベントの取り消しが
    // 消えずに残る＝全キャンセル→貼り直し方式の前提が崩れる）。
    if (data?.tag === ASSIGNMENT_TAG || data?.tag === CLASS_EVENT_TAG) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier)
    }
  }
  for (const n of notifications) {
    const { title, body } = buildAssignmentNotificationContent(n)
    const isEvent = n.kind === 'class-event'
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { tag: isEvent ? CLASS_EVENT_TAG : ASSIGNMENT_TAG, kind: n.kind },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(n.fireAt),
        channelId: isEvent ? CLASS_EVENT_CHANNEL_ID : ASSIGNMENT_CHANNEL_ID,
      },
    })
  }
}

/**
 * 新着掲示を即時ローカル通知する（trigger に channelId のみ＝即時発火＋チャンネル指定）。
 * 出席/課題の予約枠（iOS 64枠・refreshAllNotifications）とは独立。Expo Go では no-op。
 */
export async function presentBulletinNotifications(items: BulletinItem[]): Promise<void> {
  const Notifications = await loadNotifications()
  if (!Notifications || items.length === 0) return
  const { title, body } = buildBulletinNotificationContent(items)
  // trigger に channelId のみ渡すと即時発火＋Androidチャンネル指定になる（ChannelAwareTriggerInput）。
  // iOS では channelId は無視され即時提示される。
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { tag: BULLETIN_TAG } },
    trigger: { channelId: BULLETIN_CHANNEL_ID },
  })
}

/**
 * 出席受付openを即時ローカル通知する（trigger に channelId のみ＝即時発火＋チャンネル指定）。
 * 既存 attendance チャンネル（AndroidImportance.MAX）に相乗り。掲示の即時通知と同型。
 * 出席の予約枠（refreshAllNotifications・iOS 64枠）とは独立。Expo Go では no-op。
 */
export async function presentAttendanceOpenNotification(content: {
  title: string
  body: string
}): Promise<void> {
  const Notifications = await loadNotifications()
  if (!Notifications) return
  await Notifications.scheduleNotificationAsync({
    content: { title: content.title, body: content.body, data: { tag: ATTENDANCE_OPEN_TAG } },
    trigger: { channelId: ATTENDANCE_CHANNEL_ID },
  })
}

/**
 * 配信済み通知のうち、指定タグ（かつ match を満たすもの）を通知トレイから消す。
 * **自タグ以外は絶対に触らない**（他機能の通知を巻き込んで消さないこと）。
 * 用が済んだ通知を残すと、ユーザーはアプリで解決済みの件を何度も見ることになる。
 */
async function clearDelivered(
  tags: string[],
  match?: (data: NotifResponseData) => boolean,
): Promise<void> {
  const Notifications = await loadNotifications()
  if (!Notifications) return
  const presented = await Notifications.getPresentedNotificationsAsync()
  for (const n of presented) {
    const data = (n.request.content.data ?? {}) as NotifResponseData
    if (!data.tag || !tags.includes(data.tag)) continue
    if (match && !match(data)) continue
    await Notifications.dismissNotificationAsync(n.request.identifier)
  }
}

/** 配信済みの受付open通知を消す（出席済み検出時に呼ぶ）。他タグは触らない。 */
export async function clearDeliveredAttendanceOpenNotifications(): Promise<void> {
  await clearDelivered([ATTENDANCE_OPEN_TAG])
}

/**
 * 授業開始の予約アラーム（attendance-start）の配信済み通知を消す。
 *
 * **受付open通知が出たときに呼ぶ**。開始アラームは時間割から推測して「入力できるか確認しましょう」と
 * 言うだけだが、受付open通知は CLASS を実際に見て「受付中（14:40〜16:10）」と事実を言う。
 * 授業開始で isInClassPeriod が真→エンジン起動→accepting 検知、が予約アラームとほぼ同時刻になるため、
 * 両方MAXチャンネル（音＋ヘッドアップ）で立て続けに鳴っていた（実機報告 2026-07-17「一気に2つきてうるさい」）。
 * 情報として上位の受付open通知を残し、推測ベースの開始アラームを畳む。
 * courseCode 指定時はその科目のものだけ消す（別授業の予約アラームを巻き込まない）。
 * last-chance は「まだなら今のうちに」＝別の役割なので消さない。
 */
export async function clearDeliveredAttendanceStartNotifications(courseCode?: string | null): Promise<void> {
  await clearDelivered(
    [TAG],
    (d) => d.kind === 'attendance-start' && (!courseCode || d.courseCode === courseCode),
  )
}


/**
 * LETUS新着（コース活動の増分）を即時ローカル通知する。新着掲示と同型
 * （trigger に channelId のみ＝即時発火・予約枠から独立・Expo Go では no-op）。
 */
export async function presentLetusNewsNotification(content: { title: string; body: string }): Promise<void> {
  const Notifications = await loadNotifications()
  if (!Notifications) return
  await Notifications.scheduleNotificationAsync({
    content: { title: content.title, body: content.body, data: { tag: LETUS_NEWS_TAG } },
    trigger: { channelId: LETUS_NEWS_CHANNEL_ID },
  })
}

/**
 * 配信済みのLETUS新着通知を消す。**起動時とコース一覧を開いた時**に呼ぶ。他タグは触らない。
 * 起動時だけだと、アプリを使っている最中に届いた通知が一覧を見ても消えず、再起動まで残る。
 */
export async function clearDeliveredLetusNewsNotifications(): Promise<void> {
  await clearDelivered([LETUS_NEWS_TAG])
}

/**
 * 配信済みの新着掲示通知を消す。**起動時と掲示一覧を開いた時**に呼ぶ。他タグは触らない。
 * 起動時だけだと、アプリを使っている最中に届いた通知が一覧を見ても消えず、再起動まで残る
 * （実機報告 2026-07-17「一覧に入っても消えない」）。
 */
export async function clearDeliveredBulletinNotifications(): Promise<void> {
  await clearDelivered([BULLETIN_TAG])
}
