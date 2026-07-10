import { describe, expect, it } from 'vitest'
import { buildClassEventNotifications } from './eventSchedule'
import type { ClassEvent } from './classEvent'

const ev = (o: Partial<ClassEvent>): ClassEvent => ({
  id: 'e', courseName: '物理学実験A', courseCode: null, type: 'quiz', date: '2026-07-20',
  periods: [1], room: null, note: null, createdAt: '', ...o,
})
const now = new Date(2026, 6, 14, 12, 0) // 2026-07-14 12:00

describe('buildClassEventNotifications', () => {
  it('小テストは前日20時と当日8時', () => {
    const n = buildClassEventNotifications([ev({ type: 'quiz', date: '2026-07-20' })], now)
    const times = n.map((x) => x.fireAt.getTime()).sort()
    expect(times).toEqual([new Date(2026, 6, 19, 20, 0).getTime(), new Date(2026, 6, 20, 8, 0).getTime()])
  })
  it('休講は当日8時のみ', () => {
    const n = buildClassEventNotifications([ev({ type: 'cancel', date: '2026-07-20', makeupStatus: 'none' })], now)
    expect(n.map((x) => x.fireAt.getTime())).toEqual([new Date(2026, 6, 20, 8, 0).getTime()])
  })
  it('補講(確定)は補講日で前日/当日、未定は通知なし', () => {
    const has = ev({ type: 'cancel', date: '2026-07-20', makeupStatus: 'has', makeup: { date: '2026-07-27', periods: [3], room: null } })
    const n = buildClassEventNotifications([has], now)
    const times = n.map((x) => x.fireAt.getTime()).sort()
    expect(times).toContain(new Date(2026, 6, 20, 8, 0).getTime())
    expect(times).toContain(new Date(2026, 6, 26, 20, 0).getTime())
    expect(times).toContain(new Date(2026, 6, 27, 8, 0).getTime())

    const undecided = ev({ type: 'cancel', date: '2026-07-20', makeupStatus: 'undecided' })
    const n2 = buildClassEventNotifications([undecided], now).filter((x) => x.title.includes('補講'))
    expect(n2).toEqual([])
  })
  it('過去のfireAtは除外', () => {
    const n = buildClassEventNotifications([ev({ type: 'quiz', date: '2026-07-14' })], now)
    expect(n).toEqual([])
  })
})
