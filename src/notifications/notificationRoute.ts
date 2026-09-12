/**
 * 通知タップの着地先を決める純粋関数（RN非依存＝vitest で固定できる）。
 * 実際の遷移は navigation/notificationDispatch.ts が navigationRef の request* へ配線する。
 * ウィジェットのディープリンク（widgetDeepLink → widgetLinking）と同じ形。
 */
import {
  ATTENDANCE_TAG,
  ASSIGNMENT_TAG,
  CLASS_EVENT_TAG,
  BULLETIN_TAG,
  ATTENDANCE_OPEN_TAG,
  LETUS_NEWS_TAG,
} from './notificationTags'

/** 通知の data。予約時に notifier が載せる（旧版の予約にはキーが欠けている点に注意）。 */
export type NotificationPayload = {
  tag?: string
  kind?: string
  courseCode?: string
  /** 課題リマインドの対象。値は課題ページURL（LetusAssignmentDetail の params.url と同じ）。 */
  assignmentId?: string
  /** 各回イベントの識別子（現状ルート決定には使わないが、日付精度の着地を足すときの足がかり）。 */
  eventId?: string
  /** 出席の予約（N1）: まとめた全科目のコード・名前（科目コードの昇順）。着地には使わない。 */
  courseCodes?: string[]
  courseNames?: string[]
  /** 出席の予約（N1）: 'YYYY-MM-DD'・'HH:MM-HH:MM'・実際に予約した時刻（ISO）。計器が保留の時刻を知る唯一の手段（iOS は保留から時刻を読めない）。 */
  date?: string
  span?: string
  fireAt?: string
  /** 受付open（N1）: 当てたコマ（開始の枠の identifier）と、音なしで置き換えたか。 */
  slotId?: string
  quiet?: boolean
}

export type NotificationRoute =
  | { kind: 'attendance' }
  | { kind: 'bulletins' }
  | { kind: 'letusCourses' }
  | { kind: 'assignmentDetail'; url: string }
  | { kind: 'assignmentsList' }
  | { kind: 'timetable' }

export function routeForNotification(
  d: NotificationPayload | null | undefined,
): NotificationRoute | null {
  switch (d?.tag) {
    case ATTENDANCE_TAG:
    case ATTENDANCE_OPEN_TAG:
      // 出席画面は「今の授業」を自力で解決するので courseCode は使わない。
      return { kind: 'attendance' }
    case BULLETIN_TAG:
      // 掲示は複数件を1通に束ねるため個別idを載せられない＝一覧着地が正しい仕様。
      return { kind: 'bulletins' }
    case LETUS_NEWS_TAG:
      return { kind: 'letusCourses' }
    case ASSIGNMENT_TAG:
      if (d.kind === 'morning-digest') return { kind: 'assignmentsList' }
      // assignmentId 欠落は「更新前に配信済みの旧payload」。無反応にせず一覧へ落とす。
      if (typeof d.assignmentId === 'string' && d.assignmentId.length > 0) {
        return { kind: 'assignmentDetail', url: d.assignmentId }
      }
      return { kind: 'assignmentsList' }
    case CLASS_EVENT_TAG:
      // TimetableHome は params:undefined で日付を受けられないため、当面はタブ着地まで。
      return { kind: 'timetable' }
    default:
      return null
  }
}
