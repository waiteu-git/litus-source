import { describe, it, expect, vi } from 'vitest'
import { demoOverrides, demoWindow, demoAttendanceCourse, pickDemoAttendanceClass } from './demoAttendance'
import { DEMO_TIMETABLE } from '../demo/demoFixtures'
import { pickFocusClass } from '../home/focusClass'
import { resolveCurrentQuarter } from '../timetableEvents/quarter'
import type { TimetableCollection } from '../collect/timetableMessage'
import type { TimetableClass } from '../parsers/timetable'

const NOW = new Date('2026-09-16T13:05:00+09:00')

const mk = (courseCode: string, name: string, quarter?: 'first' | 'second'): TimetableClass => ({
  courseCode,
  name,
  teachers: ['テスト 教員'],
  room: 'テスト101',
  isRemote: false,
  credits: 2,
  badges: [],
  ...(quarter ? { quarter } : null),
})

/** 月1・月3・水2 だけの最小時間割（時限は DEMO_TIMETABLE と同じ刻み）。 */
const TT: TimetableCollection[] = [
  {
    slots: [
      { day: 'mon', period: 1, classes: [mk('T001', 'アルファ論')] },
      { day: 'mon', period: 3, classes: [mk('T002', 'ブラボー学')] },
      { day: 'wed', period: 2, classes: [mk('T003', 'チャーリー演習')] },
    ],
    periodTimes: {
      campus: 'テストキャンパス',
      periods: [
        { period: 1, start: '09:00', end: '10:30' },
        { period: 2, start: '10:40', end: '12:10' },
        { period: 3, start: '13:00', end: '14:30' },
      ],
    },
  },
]

/** 積みコマ（半期科目）だけの時間割。 */
const TT_STACKED: TimetableCollection[] = [
  {
    slots: [
      {
        day: 'mon',
        period: 1,
        classes: [mk('T010', '前半デルタ', 'first'), mk('T011', '後半エコー', 'second')],
      },
    ],
    periodTimes: {
      campus: 'テストキャンパス',
      periods: [{ period: 1, start: '09:00', end: '10:30' }],
    },
  },
]

const at = (iso: string) => new Date(iso)

describe('pickDemoAttendanceClass', () => {
  it('授業中はその進行中のコマを返す（ホームの「いまの授業」と同じ科目）', () => {
    // 月曜13:05 = 3限(13:00-14:30)の最中。
    const c = pickDemoAttendanceClass(TT, at('2026-09-14T13:05:00+09:00'))
    expect(c?.name).toBe('ブラボー学')
    expect(c?.isNow).toBe(true)
  })

  it('授業前は当日の次のコマを返す', () => {
    // 月曜07:30 = まだ1限前。
    const c = pickDemoAttendanceClass(TT, at('2026-09-14T07:30:00+09:00'))
    expect(c?.name).toBe('アルファ論')
    expect(c?.isNow).toBe(false)
  })

  it('当日の授業が全て終わっていたら翌授業日の最初のコマを返す', () => {
    // 月曜22:00 = 月曜は終了。翌日(火)は授業なし → 水2 チャーリー演習。
    const c = pickDemoAttendanceClass(TT, at('2026-09-14T22:00:00+09:00'))
    expect(c?.name).toBe('チャーリー演習')
  })

  it('日曜・深夜でも週をまたいで次のコマを返す（審査員がいつ開いても機能が見える）', () => {
    // 日曜03:00 → 翌日の月1。
    const c = pickDemoAttendanceClass(TT, at('2026-09-13T03:00:00+09:00'))
    expect(c?.name).toBe('アルファ論')
  })

  it('授業が1件も無ければ null（架空データを捏造しない）', () => {
    expect(pickDemoAttendanceClass([], NOW)).toBeNull()
    expect(
      pickDemoAttendanceClass([{ slots: [], periodTimes: TT[0].periodTimes }], NOW),
    ).toBeNull()
  })

  it('積みコマは現在の半期に該当する科目を選ぶ（ホームの代表科目と同じ規則）', () => {
    const during = at('2026-09-14T09:30:00+09:00')
    expect(pickDemoAttendanceClass(TT_STACKED, during, 'first')?.name).toBe('前半デルタ')
    expect(pickDemoAttendanceClass(TT_STACKED, during, 'second')?.name).toBe('後半エコー')
  })
})

describe('demoAttendanceCourse', () => {
  it('時間割が未読込（空配列）でもデモ時間割から科目を引く（起動直後に空欄にしない）', () => {
    const name = demoAttendanceCourse([], NOW)
    expect(name).toBeTruthy()
    const all = DEMO_TIMETABLE.flatMap((c) => c.slots.flatMap((s) => s.classes.map((k) => k.name)))
    expect(all).toContain(name)
  })

  it('渡された時間割を優先する（デモ中の表示状態と食い違わせない）', () => {
    expect(demoAttendanceCourse(TT, at('2026-09-14T13:05:00+09:00'))).toBe('ブラボー学')
  })
})

describe('デモの受付科目と時間割の整合（審査員が矛盾を見ない）', () => {
  /**
   * 実バグの回帰テスト。科目名が定数だったため、何時に見ても同じ科目が「受付中」になり、
   * 月曜13:15 に「ホーム=線形代数学I（mon3）」「出席=情報リテラシー演習（mon1）」という
   * 矛盾が出ていた。ホームのヒーローが出る全時刻で科目が一致することを固定する。
   */
  it('ホームの「いまの授業」が出る全時刻で、出席の「受付中」と科目が一致する', () => {
    // 2026-09-13(日) 00:00 から1週間を15分刻みで走査する。
    const start = at('2026-09-13T00:00:00+09:00')
    let checked = 0
    for (let i = 0; i < 4 * 24 * 7; i++) {
      const t = new Date(start.getTime() + i * 15 * 60000)
      const cq = resolveCurrentQuarter(null, t)
      const hero = pickFocusClass(DEMO_TIMETABLE, t, undefined, cq)
      if (!hero) continue
      checked++
      const o = demoOverrides({ attended: null, submit: () => {}, now: t, timetable: DEMO_TIMETABLE, currentQuarter: cq })
      expect(o.reception?.courseName).toBe(hero.name)
    }
    expect(checked).toBeGreaterThan(100)
  })

  it('どの時刻でも受付中の科目が空にならない（送信フローが常に見える）', () => {
    const start = at('2026-09-13T00:00:00+09:00')
    for (let i = 0; i < 4 * 24 * 7; i++) {
      const t = new Date(start.getTime() + i * 15 * 60000)
      const o = demoOverrides({ attended: null, submit: () => {}, now: t, timetable: DEMO_TIMETABLE })
      expect(o.reception?.courseName).toBeTruthy()
      expect(o.reception?.accepting).toBe(true)
    }
  })
})

describe('demoOverrides', () => {
  const base = { attended: null, submit: () => {}, now: NOW, timetable: DEMO_TIMETABLE }

  it('未出席なら受付中に見える（審査員が送信ボタンに到達できる）', () => {
    const o = demoOverrides(base)
    expect(o.reception?.status).toBe('accepting')
    expect(o.reception?.accepting).toBe(true)
    expect(o.reception?.courseName).toBe(demoAttendanceCourse(DEMO_TIMETABLE, NOW))
    expect(o.reception?.confirmWindow).toBe(demoWindow(NOW))
    expect(o.phase).toBe('ready')
    expect(o.attendedNow).toBe(false)
    expect(o.result).toBeNull()
  })

  it('出席後は成功状態に遷移する', () => {
    const rec = {
      date: '2026-05-11',
      courseName: demoAttendanceCourse(DEMO_TIMETABLE, NOW),
      confirmWindow: demoWindow(NOW),
      code: '1234',
    }
    const o = demoOverrides({ ...base, attended: rec })
    expect(o.phase).toBe('result')
    expect(o.reception?.status).toBe('attended')
    expect(o.reception?.accepting).toBe(false)
    expect(o.attendedNow).toBe(true)
    expect(o.result?.ok).toBe(true)
    expect(o.attended).toEqual(rec)
  })

  it('出席後の受付表示は記録した科目のままにする（送信直後にコマが変わっても入れ替えない）', () => {
    const rec = {
      date: '2026-05-11',
      courseName: '記録した科目',
      confirmWindow: demoWindow(NOW),
      code: '1234',
    }
    const o = demoOverrides({ ...base, attended: rec })
    expect(o.reception?.courseName).toBe('記録した科目')
  })

  it('渡された submit をそのまま返す（実送信経路を上書きする）', () => {
    const spy = vi.fn()
    const o = demoOverrides({ ...base, submit: spy })
    o.submit?.()
    expect(spy).toHaveBeenCalledOnce()
  })

  it('エラー・競合状態を出さない（デモで警告が出ると審査員が誤認する）', () => {
    const o = demoOverrides(base)
    expect(o.reception?.error).toBeNull()
    expect(o.reception?.network).toBe('on')
    expect(o.conflict).toBe(false)
    expect(o.conflictExhausted).toBe(false)
    expect(o.failCount).toBe(0)
  })

  it('受付窓が now を跨ぐ（受付中ピルと受付終了カウントダウンの矛盾を防ぐ）', () => {
    // 画面は confirmWindow から残り時間を計算する。固定窓だとその時刻を外れた瞬間に
    // 「受付中」と「受付終了」が同時に出る。
    const w = demoWindow(NOW)
    const [from, to] = w.split('〜')
    expect(from < '13:05').toBe(true)
    expect(to > '13:05').toBe(true)
  })

  it('running を偽らない（SyncProviderが「授業中」と誤判定して確認ダイアログを出すため）', () => {
    expect(demoOverrides(base).running).toBeUndefined()
  })
})
