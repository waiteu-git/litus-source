import { computeNotificationSchedule, type SchedulableAssignment } from './schedule'

/** ローカル時刻でISO文字列を作るヘルパー（monthは1始まり） */
function localIso(y: number, mo: number, d: number, h = 23, mi = 59): string {
  return new Date(y, mo - 1, d, h, mi, 0, 0).toISOString()
}

function assignment(
  id: string,
  deadline: string | null,
  submissionStatus: SchedulableAssignment['submissionStatus'] = 'not_submitted',
): SchedulableAssignment {
  return { id, title: `課題${id}`, deadline, submissionStatus }
}

describe('computeNotificationSchedule — 締切前リマインダー', () => {
  it('未提出課題に24h/3h/1h前を予約し、過去分は除外する', () => {
    const now = new Date(2026, 6, 5, 6, 0, 0) // 7/5 06:00
    const a1 = assignment('1', localIso(2026, 7, 5, 23, 59)) // 当日23:59締切
    const schedule = computeNotificationSchedule([a1], now)
    const reminders = schedule.filter((s) => s.kind !== 'morning-digest')
    // 24h前=7/4 23:59は過去なので除外、3h前=20:59・1h前=22:59のみ
    expect(reminders.map((r) => r.kind)).toEqual(['deadline-3h', 'deadline-1h'])
    const r3h = new Date(reminders[0].fireAt)
    expect(r3h.getDate()).toBe(5)
    expect(r3h.getHours()).toBe(20)
    expect(r3h.getMinutes()).toBe(59)
  })

  it('提出済み・締切なしはリマインダー対象外', () => {
    const now = new Date(2026, 6, 5, 6, 0, 0)
    const submitted = assignment('1', localIso(2026, 7, 10), 'submitted')
    const completed = assignment('2', localIso(2026, 7, 10), 'completed')
    const noDeadline = assignment('3', null)
    const schedule = computeNotificationSchedule([submitted, completed, noDeadline], now)
    expect(schedule.filter((s) => s.kind !== 'morning-digest')).toHaveLength(0)
  })

  it('リマインダーは締切ISOから閾値を引いた時刻に発火する', () => {
    const now = new Date(2026, 6, 1, 0, 0, 0)
    const a = assignment('1', localIso(2026, 7, 6, 12, 0)) // 7/6 12:00締切
    const schedule = computeNotificationSchedule([a], now)
    const r1h = schedule.find((s) => s.kind === 'deadline-1h')!
    const t = new Date(r1h.fireAt)
    expect(t.getDate()).toBe(6)
    expect(t.getHours()).toBe(11)
    expect(t.getMinutes()).toBe(0)
  })
})

describe('computeNotificationSchedule — 朝まとめ', () => {
  it('毎朝7:00に今日/明日締切を集計し、対象0件の朝は送らない', () => {
    const now = new Date(2026, 6, 5, 6, 0, 0) // 7/5 06:00
    const assignments = [
      assignment('1', localIso(2026, 7, 5, 23, 59)), // 今日(7/5)
      assignment('2', localIso(2026, 7, 6, 12, 0)), // 明日(7/6)
      assignment('3', localIso(2026, 7, 10, 23, 59)), // 7/10
    ]
    const digests = computeNotificationSchedule(assignments, now).filter(
      (s) => s.kind === 'morning-digest',
    )
    // 7/5(今日1,明日1)、7/6(今日1,明日0)、7/9(今日0,明日1)、7/10(今日1,明日0) の4回。7/7,7/8,7/11は0件で送らない
    expect(digests).toHaveLength(4)
    const first = digests[0]
    const d = new Date(first.fireAt)
    expect(d.getDate()).toBe(5)
    expect(d.getHours()).toBe(7)
    expect(d.getMinutes()).toBe(0)
    expect(first).toMatchObject({ dueToday: 1, dueTomorrow: 1 })
  })

  it('当日の7:00を過ぎていればその朝はスキップする', () => {
    const now = new Date(2026, 6, 5, 8, 0, 0) // 7/5 08:00（7:00超過）
    const assignments = [assignment('1', localIso(2026, 7, 5, 23, 59))]
    const digests = computeNotificationSchedule(assignments, now).filter(
      (s) => s.kind === 'morning-digest',
    )
    // 7/5朝はスキップ。7/6朝は今日0明日0でスキップ → 朝まとめなし
    expect(digests).toHaveLength(0)
  })

  it('morningHour と digestDaysAhead を上書きできる', () => {
    const now = new Date(2026, 6, 5, 0, 0, 0)
    const assignments = [assignment('1', localIso(2026, 7, 20, 23, 59))]
    const digests = computeNotificationSchedule(assignments, now, {
      morningHour: 6,
      digestDaysAhead: 30,
    }).filter((s) => s.kind === 'morning-digest')
    // 7/19(明日1)と7/20(今日1)の2回、いずれも6:00
    expect(digests).toHaveLength(2)
    expect(new Date(digests[0].fireAt).getHours()).toBe(6)
  })
})

describe('computeNotificationSchedule — 全体', () => {
  it('fireAt昇順でソートして返す', () => {
    const now = new Date(2026, 6, 5, 6, 0, 0)
    const assignments = [
      assignment('1', localIso(2026, 7, 5, 23, 59)),
      assignment('2', localIso(2026, 7, 6, 12, 0)),
    ]
    const schedule = computeNotificationSchedule(assignments, now)
    const times = schedule.map((s) => new Date(s.fireAt).getTime())
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })

  it('課題なしは空配列', () => {
    expect(computeNotificationSchedule([], new Date(2026, 6, 5))).toEqual([])
  })
})
