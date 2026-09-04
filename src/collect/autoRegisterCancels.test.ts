import { describe, it, expect, beforeEach, vi } from 'vitest'

// AsyncStorage をモック（attendanceDoneStore.test.ts と同方式）。台帳・ClassEvents・時間割の
// 3ストアをまたぐ実際の read-modify-write を、実ストア実装ごと検証する。
const mockStore: Record<string, string> = {}
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(mockStore[key] ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      mockStore[key] = value
      return Promise.resolve()
    }),
    removeItem: vi.fn((key: string) => {
      delete mockStore[key]
      return Promise.resolve()
    }),
  },
}))

import { autoRegisterCancelsFromBulletins } from './autoRegisterCancels'
import { loadClassEvents, upsertClassEvent, removeClassEvent } from '../storage/classEventsStore'
import { saveTimetable } from '../storage/timetableStore'
import { setDemoNamespace } from '../storage/asyncStorage'
import type { BulletinItem } from '../storage/bulletinDigestSerialize'
import type { TimetableCollection } from '../collect/timetableMessage'
import type { ClassEvent } from '../timetableEvents/classEvent'

const LEDGER_KEY = 'litus.autoRegisteredCancels.v1'

function col(classes: { courseCode: string; name: string }[]): TimetableCollection {
  return {
    slots: [
      {
        day: 'wed',
        period: 3,
        classes: classes.map((c) => ({ ...c, teachers: [], room: '', isRemote: false, credits: null, badges: [] })),
      },
    ],
    periodTimes: null,
  }
}

function cancelItem(
  id: string,
  opts: { courseCode?: string; courseName: string; date: string; periods: string },
): BulletinItem {
  const codePart = opts.courseCode ? `${opts.courseCode} ` : ''
  const body = {
    from: '',
    category: '休講',
    subject: '',
    period: '',
    text: `授業名：${codePart}${opts.courseName}\n休講日：${opts.date}(水) ${opts.periods}限`,
    hasAttachment: false,
  }
  return {
    id,
    category: '休講',
    title: `【休講】${opts.courseName}`,
    date: opts.date,
    meta: '',
    unread: true,
    flagged: false,
    important: false,
    body,
  }
}

describe('autoRegisterCancelsFromBulletins（211 積み荷② 関門A+B の結線）', () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach((k) => delete mockStore[k])
    setDemoNamespace(false)
  })

  it('🔴回帰: 自動登録→利用者が削除→再同期→復活しない（210で撤去した欠陥の再発防止）', async () => {
    await saveTimetable([col([{ courseCode: '9973415', name: '図学・製図' }])])
    const bulletin = [
      cancelItem('b1', { courseCode: '9973415', courseName: '図学・製図', date: '2026/10/21', periods: '3' }),
    ]

    const r1 = await autoRegisterCancelsFromBulletins(bulletin, new Date(2026, 8, 10))
    expect(r1.added).toBe(1)
    const registered = await loadClassEvents()
    expect(registered).toHaveLength(1)
    expect(registered[0].type).toBe('cancel')

    await removeClassEvent(registered[0].id)
    expect(await loadClassEvents()).toEqual([])

    // 掲示はまだ保持期間内＝同じ候補が再度出てくるが、台帳に記憶が残っているので復活しない。
    const r2 = await autoRegisterCancelsFromBulletins(bulletin, new Date(2026, 8, 11))
    expect(r2.added).toBe(0)
    expect(await loadClassEvents()).toEqual([])
  })

  it('自動登録→利用者が日付を編集→再同期→二重にならない', async () => {
    await saveTimetable([col([{ courseCode: '9973415', name: '図学・製図' }])])
    const bulletin = [
      cancelItem('b1', { courseCode: '9973415', courseName: '図学・製図', date: '2026/10/21', periods: '3' }),
    ]

    await autoRegisterCancelsFromBulletins(bulletin, new Date(2026, 8, 10))
    const [ev] = await loadClassEvents()
    await upsertClassEvent({ ...ev, date: '2026-10-22' })

    const r2 = await autoRegisterCancelsFromBulletins(bulletin, new Date(2026, 8, 11))
    expect(r2.added).toBe(0)
    const after = await loadClassEvents()
    expect(after).toHaveLength(1)
    expect(after[0].date).toBe('2026-10-22') // 編集内容が上書きされていない
  })

  it('台帳が壊れている(JSON不正)→自動登録しない（禁止事項4）。未初期化(空)とは挙動が違う', async () => {
    await saveTimetable([col([{ courseCode: '9973415', name: '図学・製図' }])])
    mockStore[LEDGER_KEY] = '{not valid json'
    const bulletin = [
      cancelItem('b1', { courseCode: '9973415', courseName: '図学・製図', date: '2026/10/21', periods: '3' }),
    ]

    const r = await autoRegisterCancelsFromBulletins(bulletin, new Date(2026, 8, 10))
    expect(r.added).toBe(0)
    expect(await loadClassEvents()).toEqual([])
    // 壊れた値を勝手に上書きしない（次回同期での再評価に委ねる）
    expect(mockStore[LEDGER_KEY]).toBe('{not valid json')
  })

  it('台帳キーが未初期化(=空)なら通常どおり登録する（壊れているケースと区別する）', async () => {
    await saveTimetable([col([{ courseCode: '9973415', name: '図学・製図' }])])
    expect(mockStore[LEDGER_KEY]).toBeUndefined()
    const bulletin = [
      cancelItem('b1', { courseCode: '9973415', courseName: '図学・製図', date: '2026/10/21', periods: '3' }),
    ]
    const r = await autoRegisterCancelsFromBulletins(bulletin, new Date(2026, 8, 10))
    expect(r.added).toBe(1)
  })

  it('date<todayのキーが掃除される（台帳が単調増加しない）', async () => {
    await saveTimetable([col([{ courseCode: '9973415', name: '図学・製図' }])])
    const bulletin = [
      cancelItem('b1', { courseCode: '9973415', courseName: '図学・製図', date: '2026/09/01', periods: '3' }),
    ]
    await autoRegisterCancelsFromBulletins(bulletin, new Date(2026, 8, 1))
    expect(JSON.parse(mockStore[LEDGER_KEY])).toHaveLength(1)

    // 休講候補が無い回の同期でも、日付が過ぎたキーの掃除は毎回走る。
    await autoRegisterCancelsFromBulletins([], new Date(2026, 8, 5))
    expect(JSON.parse(mockStore[LEDGER_KEY])).toEqual([])
  })

  it('同名科目の同日休講は2件とも登録される（コードが違えば別スロット）', async () => {
    await saveTimetable([
      col([
        { courseCode: '1111111', name: '英語３' },
        { courseCode: '2222222', name: '英語３' },
      ]),
    ])
    const bulletin = [
      cancelItem('b1', { courseCode: '1111111', courseName: '英語３', date: '2026/10/21', periods: '3' }),
      cancelItem('b2', { courseCode: '2222222', courseName: '英語３', date: '2026/10/21', periods: '3' }),
    ]
    const r = await autoRegisterCancelsFromBulletins(bulletin, new Date(2026, 8, 10))
    expect(r.added).toBe(2)
    expect(await loadClassEvents()).toHaveLength(2)
  })

  it('🔴 時間割に無い科目の候補は自動登録されない（禁止事項5・消せない休講を作らない）', async () => {
    await saveTimetable([col([{ courseCode: '9999999', name: '別の科目' }])])
    const bulletin = [
      cancelItem('b1', { courseCode: '9973415', courseName: '図学・製図', date: '2026/10/21', periods: '3' }),
    ]
    const r = await autoRegisterCancelsFromBulletins(bulletin, new Date(2026, 8, 10))
    expect(r.added).toBe(0)
    expect(await loadClassEvents()).toEqual([])
  })

  it('時間割が未収集(null)なら自動登録しない', async () => {
    // saveTimetable を呼ばない = timetable.collections.v1 が存在しない
    const bulletin = [
      cancelItem('b1', { courseCode: '9973415', courseName: '図学・製図', date: '2026/10/21', periods: '3' }),
    ]
    const r = await autoRegisterCancelsFromBulletins(bulletin, new Date(2026, 8, 10))
    expect(r.added).toBe(0)
  })

  it('背景の自動登録と画面の手動追加が並行してもどちらも残る（lost update しない）', async () => {
    await saveTimetable([
      col([
        { courseCode: '9973415', name: '図学・製図' },
        { courseCode: '8888888', name: '手動科目' },
      ]),
    ])
    const bulletin = [
      cancelItem('b1', { courseCode: '9973415', courseName: '図学・製図', date: '2026/10/21', periods: '3' }),
    ]
    const manual: ClassEvent = {
      id: 'evt_manual',
      courseName: '手動科目',
      courseCode: '8888888',
      type: 'cancel',
      date: '2026-10-22',
      periods: [2],
      room: null,
      note: null,
      createdAt: 'm1',
    }

    await Promise.all([autoRegisterCancelsFromBulletins(bulletin, new Date(2026, 8, 10)), upsertClassEvent(manual)])

    const events = await loadClassEvents()
    expect(events).toHaveLength(2)
    expect(events.some((e) => e.courseCode === '9973415')).toBe(true)
    expect(events.some((e) => e.id === 'evt_manual')).toBe(true)
  })
})
