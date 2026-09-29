import { describe, expect, it } from 'vitest'
import { buildClassEventNotifications } from './eventSchedule'
import type { ClassEvent } from './classEvent'
import { buildExamCountdown } from '../home/examCountdown'

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

describe('表示開始（countdownStart）は試験の通知を変えない（設計 A §7-2E）', () => {
  // now=2026-07-14 12:00。小テストは6日後（日時を指定＝まだ始まっていない）、期末は37日後（7日前から＝まだ）。
  const base = [ev({ id: 'q', type: 'quiz', date: '2026-07-20' }), ev({ id: 'f', type: 'final', date: '2026-08-20' })]
  const withStart: ClassEvent[] = [
    { ...base[0], countdownStart: { kind: 'at', date: '2026-07-20', time: '09:00' } },
    { ...base[1], countdownStart: { kind: 'days', days: 7 } },
  ]

  it('countdownStart の有無で、通知の件数・時刻・文面が一致する', () => {
    const a = buildClassEventNotifications(base, now)
    expect(a).toHaveLength(4)
    expect(buildClassEventNotifications(withStart, now)).toEqual(a)
  })

  it('対照: 同じ入力で試験カウントダウンは変わる（この入力で表示開始が効いている）', () => {
    expect(buildExamCountdown(base, now)).toHaveLength(2)
    expect(buildExamCountdown(withStart, now)).toEqual([])
  })
})

describe('内包補講に覆われた単独補講は通知しない（補講の二重登録・設計 2026-09-29）', () => {
  // now=2026-07-14 12:00。休講 7/20 に補講 7/27 3限を内包した休講と、同じ補講の単独補講。
  const carrier = ev({
    id: 'c1', type: 'cancel', date: '2026-07-20', courseCode: '9973415', courseName: '図学・製図',
    makeupStatus: 'has', makeup: { date: '2026-07-27', periods: [3], room: null },
  })
  const dup = ev({ id: 's1', type: 'makeup', date: '2026-07-27', periods: [3], courseCode: '9973415', courseName: '図学・製図' })
  const ids = (events: ClassEvent[]) => buildClassEventNotifications(events, now).map((n) => n.id).sort()

  it('内包側の補講の前夜・当日の1組だけが残り、単独側の通知は出ない', () => {
    expect(ids([carrier, dup])).toEqual(['c1:day', 'c1:mk:day', 'c1:mk:eve'])
  })

  it('保存順に依らない', () => {
    expect(ids([dup, carrier])).toEqual(ids([carrier, dup]))
  })

  it('休講を消すと、単独補講の前夜・当日の通知に戻る（データは保たれている）', () => {
    expect(ids([dup])).toEqual(['s1:day', 's1:eve'])
  })

  it('覆われない単独補講（別の日・別のコマ・別の授業）は従来どおり通知する', () => {
    for (const other of [
      ev({ id: 's2', type: 'makeup', date: '2026-07-28', periods: [3], courseCode: '9973415' }),
      ev({ id: 's3', type: 'makeup', date: '2026-07-27', periods: [4], courseCode: '9973415' }),
      ev({ id: 's4', type: 'makeup', date: '2026-07-27', periods: [3], courseCode: '1111111', courseName: '別の授業' }),
    ]) {
      expect(ids([carrier, other])).toEqual(expect.arrayContaining([`${other.id}:eve`, `${other.id}:day`]))
    }
  })

  it('補講が未定(undecided)の休講は覆わない（単独補講の通知は残る）', () => {
    const undecided = { ...carrier, makeupStatus: 'undecided' as const, makeup: null }
    expect(ids([undecided, dup])).toEqual(['c1:day', 's1:day', 's1:eve'])
  })
})
