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
import {
  CHANNEL_SPECS,
  toChannelInput,
  ATTENDANCE_CHANNEL_ID,
  ASSIGNMENT_CHANNEL_ID,
  BULLETIN_CHANNEL_ID,
  LETUS_NEWS_CHANNEL_ID,
  CLASS_EVENT_CHANNEL_ID,
} from './channelSpec'

// タグの定義は純粋層 notificationTags.ts が正典（notificationRoute.ts と共有する）。
import {
  ATTENDANCE_TAG,
  ASSIGNMENT_TAG,
  CLASS_EVENT_TAG,
  BULLETIN_TAG,
  ATTENDANCE_OPEN_TAG,
  LETUS_NEWS_TAG,
} from './notificationTags'
import type { NotificationPayload } from './notificationRoute'
import type { NotifPermission } from './permissionState'

export {
  ATTENDANCE_TAG,
  ASSIGNMENT_TAG,
  CLASS_EVENT_TAG,
  BULLETIN_TAG,
  ATTENDANCE_OPEN_TAG,
  LETUS_NEWS_TAG,
} from './notificationTags'

// チャンネルの定義（ID・名称・属性）は純粋層 channelSpec.ts が正典。ここは re-export のみ。
export {
  ATTENDANCE_CHANNEL_ID,
  ASSIGNMENT_CHANNEL_ID,
  BULLETIN_CHANNEL_ID,
  LETUS_NEWS_CHANNEL_ID,
  CLASS_EVENT_CHANNEL_ID,
} from './channelSpec'

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
    // 属性の内容は channelSpec.ts が正典（そこにテストとラチェットがある）。
    // ここは enum を注入して流し込むだけ。
    const enums = {
      importance: Notifications.AndroidImportance,
      visibility: Notifications.AndroidNotificationVisibility,
    }
    for (const spec of CHANNEL_SPECS) {
      await Notifications.setNotificationChannelAsync(
        spec.id,
        toChannelInput(spec, enums) as Parameters<typeof Notifications.setNotificationChannelAsync>[1],
      )
    }
  }
}

type NotifResponseData = NotificationPayload

function payloadOf(
  resp: { notification: { request: { content: { data?: unknown } } } } | null | undefined,
): NotificationPayload | null {
  const data = resp?.notification.request.content.data as NotificationPayload | undefined
  return typeof data?.tag === 'string' ? data : null
}

/**
 * アプリを起動した通知タップ（cold start）の payload を返す。無ければ null。
 * Expo Go では通知モジュールを読み込めないため null。
 * tag だけでなく data 全体を返す（課題リマインドは assignmentId で対象へ着地するため）。
 */
export async function getInitialNotificationPayload(): Promise<NotificationPayload | null> {
  const Notifications = await loadNotifications()
  if (!Notifications) return null
  return payloadOf(await Notifications.getLastNotificationResponseAsync())
}

/**
 * 消費済みの通知応答を破棄する。cold start の着地を処理した直後に呼ぶ。
 * 呼ばないと getLastNotificationResponseAsync が同じ応答を返し続け、以後の通常起動でも
 * 毎回「前回タップした通知の画面」へ飛ぶ。
 * 古い実装には存在しないので optional call にする。
 */
export async function clearConsumedNotificationResponse(): Promise<void> {
  const Notifications = await loadNotifications()
  if (!Notifications) return
  Notifications.clearLastNotificationResponse?.()
}

/**
 * 通知タップ（warm）を購読する。コールバックにはタップされた通知の payload を渡す。
 * Expo Go では no-op（null を返す）。
 */
export async function addNotificationResponseListener(
  cb: (payload: NotificationPayload | null) => void,
): Promise<{ remove: () => void } | null> {
  const Notifications = await loadNotifications()
  if (!Notifications) return null
  return Notifications.addNotificationResponseReceivedListener((resp) => cb(payloadOf(resp)))
}

/**
 * 現在の通知権限を読む。Expo Go / モジュール不在では null（回復導線を出さない）。
 *
 * **画面表示時／フォアグラウンド確定後に呼ぶこと**。canAskAgain は Activity が前面に
 * ある時しか信用できず（PermissionsService.kt は currentActivity が null なら false）、
 * 起動直後に読むと「恒久拒否」と誤判定してまだ聞けるユーザーを設定アプリへ送ってしまう。
 */
export async function getNotificationPermission(): Promise<NotifPermission | null> {
  const Notifications = await loadNotifications()
  if (!Notifications) return null
  const r = await Notifications.getPermissionsAsync()
  return {
    status: r.status as NotifPermission['status'],
    granted: r.granted,
    canAskAgain: r.canAskAgain,
  }
}

/**
 * 通知権限を要求する。Expo Go / モジュール不在では null。
 *
 * **Android は同一インストール内で2回拒否されると以後ダイアログが出ない**（無音で denied が返る）。
 * iOS は1回きり。＝要求は「ユーザーが価値を理解した後」に1回だけ出すこと。
 * 戻り値は要求後の状態そのもの（呼び出し側が canAskAgain を見て回復導線を切り替えられるように）。
 */
export async function requestNotificationPermission(): Promise<NotifPermission | null> {
  const Notifications = await loadNotifications()
  if (!Notifications) return null
  const r = await Notifications.requestPermissionsAsync()
  return {
    status: r.status as NotifPermission['status'],
    granted: r.granted,
    canAskAgain: r.canAskAgain,
  }
}

export async function syncAttendanceAlarms(alarms: AttendanceAlarm[]): Promise<void> {
  const Notifications = await loadNotifications()
  if (!Notifications) return
  // 既存の出席アラームを全キャンセルしてから貼り直す（差分管理せず単純化）。
  const scheduled = await Notifications.getAllScheduledNotificationsAsync()
  for (const n of scheduled) {
    const data = n.content.data as { tag?: string } | null
    if (data?.tag === ATTENDANCE_TAG) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier)
    }
  }
  for (const alarm of alarms) {
    const { title, body } = buildAttendanceNotificationContent(alarm)
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { tag: ATTENDANCE_TAG, courseCode: alarm.courseCode, kind: alarm.kind } },
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
    // **対象の識別子を必ず載せる**。載せないとタップされても「どの課題か」が分からず、
    // 課題リマインドは一覧までしか着地できない（assignmentId は課題ページURLそのもの）。
    const data: NotificationPayload = isEvent
      ? { tag: CLASS_EVENT_TAG, kind: n.kind, eventId: n.eventId }
      : n.kind === 'morning-digest'
        ? { tag: ASSIGNMENT_TAG, kind: n.kind }
        : { tag: ASSIGNMENT_TAG, kind: n.kind, assignmentId: n.assignmentId }
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data },
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
    [ATTENDANCE_TAG],
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

/**
 * 予約済みローカル通知を全キャンセルする。全データ消去（resetAll）から呼ぶ。
 *
 * この関数がある理由: 呼び出し側が expo-notifications を直接 import すると、Expo Go では
 * **モジュール評価時点で throw して起動できなくなる**（冒頭コメント参照）。try/catch では
 * 守れない（守れるのは呼び出しだけで、import は無条件に走る）。expo-notifications への
 * 到達は必ず本モジュールの loadNotifications() を経由させること。
 */
export async function cancelAllScheduledNotifications(): Promise<void> {
  const Notifications = await loadNotifications()
  if (!Notifications) return
  await Notifications.cancelAllScheduledNotificationsAsync()
}
