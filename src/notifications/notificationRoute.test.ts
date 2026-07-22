import { describe, it, expect } from 'vitest'
import { routeForNotification } from './notificationRoute'
import {
  ALL_NOTIFICATION_TAGS,
  ATTENDANCE_TAG,
  ASSIGNMENT_TAG,
  CLASS_EVENT_TAG,
  BULLETIN_TAG,
  ATTENDANCE_OPEN_TAG,
  LETUS_NEWS_TAG,
} from './notificationTags'

describe('routeForNotification', () => {
  it('出席アラームは出席画面へ', () => {
    expect(
      routeForNotification({ tag: ATTENDANCE_TAG, courseCode: 'X', kind: 'attendance-start' }),
    ).toEqual({ kind: 'attendance' })
  })

  it('受付openは出席画面へ', () => {
    expect(routeForNotification({ tag: ATTENDANCE_OPEN_TAG })).toEqual({ kind: 'attendance' })
  })

  it('課題リマインドは対象の課題詳細へ', () => {
    const url = 'https://letus.ed.tus.ac.jp/mod/assign/view.php?id=1'
    expect(routeForNotification({ tag: ASSIGNMENT_TAG, kind: 'deadline-1h', assignmentId: url })).toEqual(
      { kind: 'assignmentDetail', url },
    )
  })

  it('手動追加課題（manual://）も課題詳細へ', () => {
    expect(
      routeForNotification({ tag: ASSIGNMENT_TAG, kind: 'deadline-3h', assignmentId: 'manual://abc' }),
    ).toEqual({ kind: 'assignmentDetail', url: 'manual://abc' })
  })

  it('朝まとめは課題一覧へ（対象が1件に定まらない）', () => {
    expect(routeForNotification({ tag: ASSIGNMENT_TAG, kind: 'morning-digest' })).toEqual({
      kind: 'assignmentsList',
    })
  })

  /**
   * 更新前に端末の通知トレイへ配信済みの通知は assignmentId を持たない（旧 payload）。
   * ここで課題一覧へ落とさないと、更新直後にタップした人が「押しても何も起きない」を踏む。
   */
  it('assignmentId が無い旧payloadは課題一覧へフォールバック', () => {
    expect(routeForNotification({ tag: ASSIGNMENT_TAG, kind: 'deadline-24h' })).toEqual({
      kind: 'assignmentsList',
    })
  })

  it('assignmentId が空文字でも課題一覧へ（空URLで遷移しない）', () => {
    expect(
      routeForNotification({ tag: ASSIGNMENT_TAG, kind: 'deadline-24h', assignmentId: '' }),
    ).toEqual({ kind: 'assignmentsList' })
  })

  it('各回イベントは時間割タブへ', () => {
    expect(
      routeForNotification({ tag: CLASS_EVENT_TAG, kind: 'class-event', eventId: 'evt_x:day' }),
    ).toEqual({ kind: 'timetable' })
  })

  it('新着掲示は掲示一覧、LETUS新着はコース一覧へ', () => {
    expect(routeForNotification({ tag: BULLETIN_TAG })).toEqual({ kind: 'bulletins' })
    expect(routeForNotification({ tag: LETUS_NEWS_TAG })).toEqual({ kind: 'letusCourses' })
  })

  it('null / undefined / 空 / 未知タグでは何もしない（例外も投げない）', () => {
    expect(routeForNotification(null)).toBeNull()
    expect(routeForNotification(undefined)).toBeNull()
    expect(routeForNotification({})).toBeNull()
    expect(routeForNotification({ tag: 'unknown-tag' })).toBeNull()
  })

  /**
   * ラチェット: 新しい通知種別を足したのにタップ先の配線を忘れると、その通知は
   * 「押してもアプリが前面に来るだけ」になる（課題リマインドと各回イベントが実際にそうなっていた）。
   */
  it('全てのタグが着地先を持つ', () => {
    for (const tag of ALL_NOTIFICATION_TAGS) {
      expect(routeForNotification({ tag })).not.toBeNull()
    }
  })
})
