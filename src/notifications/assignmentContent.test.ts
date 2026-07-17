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

describe('各回イベント（休講/補講/小テスト/教室変更）', () => {
  // かつては notificationRefresh が kind:'deadline-24h' へ潰していたため、
  // 「締切まで24時間」「「線形代数1 休講（2026-07-20）」の締切が近づいています」という
  // 事実と食い違う文面が全イベントで出ていた（休講に締切は無く、発火は当日8:00）。
  it('eventSchedule が組んだ文面をそのまま出す（締切の言い回しへ変換しない）', () => {
    expect(
      buildAssignmentNotificationContent({
        kind: 'class-event',
        eventId: 'e1:day',
        title: '線形代数1 休講',
        body: '2026-07-20',
        fireAt: '2026-07-20T08:00:00.000Z',
      }),
    ).toEqual({ title: '線形代数1 休講', body: '2026-07-20' })
  })

  it('「締切」という語を混ぜない（回帰防止）', () => {
    const c = buildAssignmentNotificationContent({
      kind: 'class-event',
      eventId: 'e2:eve',
      title: '物理学1 小テスト',
      body: '2026-07-21 3限',
      fireAt: '2026-07-20T20:00:00.000Z',
    })
    expect(c.title).not.toContain('締切')
    expect(c.body).not.toContain('締切')
    expect(c.title).not.toContain('24時間')
  })

  it('bodyが空でも壊れない', () => {
    expect(
      buildAssignmentNotificationContent({
        kind: 'class-event',
        eventId: 'e3:day',
        title: '英語1 教室変更',
        body: '',
        fireAt: '2026-07-20T08:00:00.000Z',
      }),
    ).toEqual({ title: '英語1 教室変更', body: '' })
  })
})
