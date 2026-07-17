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

describe('2段階通知の文面（前日と当日を読み分けられること）', () => {
  // 修正前は eve と day に同じ body をそのまま渡しており、前日20:00と当日8:00に
  // **1バイトも違わない同一文面**が届いていた（「線形代数学１ 小テスト／2026-07-21 3限」×2）。
  // この test ファイルは body を一度も検証していなかったため検出できなかった。
  it('前日は「明日」・当日は「本日」で始まる', () => {
    const n = buildClassEventNotifications([ev({ type: 'quiz', date: '2026-07-20', periods: [3] })], now)
    const eve = n.find((x) => x.id.endsWith(':eve'))!
    const day = n.find((x) => x.id.endsWith(':day'))!
    expect(eve.body).toBe('明日 2026-07-20 3限')
    expect(day.body).toBe('本日 2026-07-20 3限')
  })

  it('2通の文面が同一にならない（二重通知に見えない）', () => {
    const n = buildClassEventNotifications([ev({ type: 'quiz', date: '2026-07-20' })], now)
    expect(n).toHaveLength(2)
    const texts = n.map((x) => `${x.title}|${x.body}`)
    expect(new Set(texts).size).toBe(2)
  })

  it('補講も同様に読み分けられる', () => {
    const n = buildClassEventNotifications([ev({ type: 'makeup', date: '2026-07-20', periods: [1] })], now)
    expect(n.find((x) => x.id.endsWith(':eve'))!.body).toBe('明日 2026-07-20 1限')
    expect(n.find((x) => x.id.endsWith(':day'))!.body).toBe('本日 2026-07-20 1限')
  })

  it('タイトルは段階で変えない（何の通知かは一目で同じ）', () => {
    const n = buildClassEventNotifications([ev({ type: 'quiz', date: '2026-07-20' })], now)
    expect(new Set(n.map((x) => x.title)).size).toBe(1)
  })

  it('当日8時のみの通知（休講/教室変更）は接頭辞を付けない', () => {
    const n = buildClassEventNotifications([ev({ type: 'cancel', date: '2026-07-20', makeupStatus: 'none' })], now)
    expect(n[0].body).toBe('2026-07-20')
    expect(n[0].body).not.toContain('本日')
  })
})
