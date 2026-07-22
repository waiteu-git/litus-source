/**
 * 通知 payload の data.tag（純粋・RN非依存）。
 *
 * **タグ値は変更不可**。syncAttendanceAlarms / syncAssignmentReminders は「既存予約を
 * tag 一致で全キャンセルしてから貼り直す」方式なので、値を変えると更新前に端末へ
 * 予約済みの通知が二度と掃除できない孤児になる（全データ消去でしか消えない）。
 *
 * notifier.ts（expo を触る端末層）と notificationRoute.ts（純粋なルート決定）の双方から
 * 参照するためにここへ切り出した。notifier.ts 側に置くと、vitest がテストのために
 * notifier.ts を読み込むことになり expo-constants / react-native を引き込んで落ちる。
 */

export const ATTENDANCE_TAG = 'attendance-alarm'
export const ASSIGNMENT_TAG = 'assignment-reminder'
/** 各回イベント（休講/補講/小テスト等）。予約枠は課題と共有するが分類とタップ先が別。 */
export const CLASS_EVENT_TAG = 'class-event'
export const BULLETIN_TAG = 'bulletin-new'
export const ATTENDANCE_OPEN_TAG = 'attendance-open'
export const LETUS_NEWS_TAG = 'letus-news'

/** 網羅性ラチェットの母集合。通知種別を足したらここにも足す。 */
export const ALL_NOTIFICATION_TAGS = [
  ATTENDANCE_TAG,
  ASSIGNMENT_TAG,
  CLASS_EVENT_TAG,
  BULLETIN_TAG,
  ATTENDANCE_OPEN_TAG,
  LETUS_NEWS_TAG,
] as const
