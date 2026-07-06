import { buildAssignmentNotificationContent } from './assignmentContent'

describe('buildAssignmentNotificationContent', () => {
  it('締切前リマインダー: 残り時間をタイトルに出す', () => {
    expect(
      buildAssignmentNotificationContent({
        kind: 'deadline-24h',
        assignmentId: 'u1',
        title: 'レポート第1回',
        fireAt: '2026-07-09T15:00:00.000Z',
      }),
    ).toEqual({ title: '締切まで24時間', body: '「レポート第1回」の締切が近づいています' })
    expect(
      buildAssignmentNotificationContent({
        kind: 'deadline-3h',
        assignmentId: 'u1',
        title: 'レポート第1回',
        fireAt: '2026-07-10T12:00:00.000Z',
      }).title,
    ).toBe('締切まで3時間')
    expect(
      buildAssignmentNotificationContent({
        kind: 'deadline-1h',
        assignmentId: 'u1',
        title: 'レポート第1回',
        fireAt: '2026-07-10T14:00:00.000Z',
      }).title,
    ).toBe('締切まで1時間')
  })
  it('朝まとめ: 今日/明日の件数を本文に出す', () => {
    expect(
      buildAssignmentNotificationContent({
        kind: 'morning-digest',
        fireAt: '2026-07-10T22:00:00.000Z',
        dueToday: 2,
        dueTomorrow: 1,
      }),
    ).toEqual({ title: '今日の課題', body: '今日締切 2件・明日締切 1件' })
  })
  it('朝まとめ: 片方0件は省く', () => {
    expect(
      buildAssignmentNotificationContent({
        kind: 'morning-digest',
        fireAt: '2026-07-10T22:00:00.000Z',
        dueToday: 0,
        dueTomorrow: 3,
      }).body,
    ).toBe('明日締切 3件')
    expect(
      buildAssignmentNotificationContent({
        kind: 'morning-digest',
        fireAt: '2026-07-10T22:00:00.000Z',
        dueToday: 1,
        dueTomorrow: 0,
      }).body,
    ).toBe('今日締切 1件')
  })
})
