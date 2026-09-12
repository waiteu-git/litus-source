/**
 * 受付open の順番（T17）と出席済みの取り下げ。I/O を注入して、提示 → 確認 → 取り消し → 記録 の順番を固定する。
 * 🔴 禁止事項2の回帰テスト: 提示が確かめられない限り、まだ鳴っていない開始アラームを取り消さない。
 */
import { describe, expect, it } from 'vitest'
import {
  openIdentifier,
  PRESENT_CONFIRM_MS,
  runAttendanceOpenSequence,
  runAttendedRetraction,
  type AttendanceOpenIO,
  type AttendanceOpenInput,
  type OpenPresentRequest,
} from './attendanceOpenSequence'
import { todaySlotNotices } from './attendanceSchedule'
import type { DeliveredLike } from './attendanceOpenNotify'
import { createWriteQueue } from '../storage/writeQueue'
import type { TimetableCollection } from '../collect/timetableMessage'

const cls = (courseCode: string, name: string) => ({
  courseCode, name, teachers: [], room: 'K101', isRemote: false, credits: 2, badges: [],
})
const MON2: TimetableCollection = {
  periodTimes: { campus: '野田', periods: [{ period: 2, start: '10:40', end: '12:10' }] },
  slots: [{ day: 'mon', period: 2, classes: [cls('C1', '線形代数1')] }],
}
/** 2026-09-14（月）10:41。 */
const NOW = new Date(2026, 8, 14, 10, 41, 0)
const X = 'att:s:20260914-1040'
const KEY = '2026-09-14|線形代数1|10:40〜12:10'
const INPUT: AttendanceOpenInput = {
  status: 'accepting',
  courseName: '線形代数1',
  confirmWindow: '10:40〜12:10',
  now: NOW,
  attendedNow: false,
  attendanceFocused: false,
  courseCode: 'C1',
  courseDisabled: false,
}
const deliveredStart = (date: number): DeliveredLike => ({
  identifier: X,
  date,
  data: { tag: 'attendance-alarm', kind: 'attendance-start' },
})

function world(opts: {
  delivered?: DeliveredLike[]
  presentFails?: boolean
  handlerTimeout?: boolean
  notified?: string[]
  timetable?: TimetableCollection[]
  queue?: <T>(task: () => Promise<T>) => Promise<T>
} = {}) {
  const calls: string[] = []
  const requests: OpenPresentRequest[] = []
  let notified = opts.notified ?? []
  let presented: DeliveredLike[] = opts.delivered ?? []
  let t = NOW.getTime()
  const io: AttendanceOpenIO = {
    loadNotified: async () => notified,
    mutateNotified: async (m) => (notified = m(notified)),
    todayNotices: () => todaySlotNotices(opts.timetable ?? [MON2], NOW),
    enqueue: opts.queue ?? (<T,>(task: () => Promise<T>) => task()),
    getPresented: async () => presented,
    present: async (req) => {
      requests.push(req)
      calls.push(`present:${req.identifier ?? 'uuid'}`)
      if (opts.presentFails) throw new Error('reject')
      // promise は解決するが、JS ハンドラが3秒で打ち切られて提示されない（§3）。
      if (opts.handlerTimeout) return
      const id = req.identifier ?? 'uuid-1'
      presented = [...presented.filter((p) => p.identifier !== id), { identifier: id, date: t, data: req.data }]
    },
    cancelScheduled: async (id) => {
      calls.push(`cancel:${id}`)
    },
    clearDeliveredStart: async (code) => {
      calls.push(`clearStart:${code}`)
    },
    recordAnnounced: async (id) => {
      calls.push(`record:${id}`)
    },
    sleep: async (ms) => {
      t += ms
    },
    clock: () => t,
  }
  return { io, calls, requests, elapsed: () => t - NOW.getTime(), notified: () => notified }
}

describe('🔴 T17 受付open の順番（提示 → 確認 → 取り消し → 記録）', () => {
  it('b: 提示が確かめられたら、X の保留を1回だけ取り消して記録する。提示の identifier は X ではない', async () => {
    const w = world()
    expect(await runAttendanceOpenSequence(w.io, INPUT)).toBe('announced')
    expect(w.calls).toEqual([`present:${openIdentifier(KEY)}`, `cancel:${X}`, `record:${X}`])
    expect(w.requests[0].identifier).not.toBe(X)
    expect(w.requests[0]).toMatchObject({ sound: true, data: { tag: 'attendance-open', slotId: X } })
    expect(w.notified()).toEqual([KEY])
  })

  it('present が reject → 取り消し0回・記録0。登録したキーは戻さない', async () => {
    const w = world({ presentFails: true })
    expect(await runAttendanceOpenSequence(w.io, INPUT)).toBe('present-failed')
    expect(w.calls).toEqual([`present:${openIdentifier(KEY)}`])
    expect(w.notified()).toEqual([KEY])
  })

  it('present は解決したが getPresented に出ない（ハンドラの打ち切り）→ 取り消し0回・記録0', async () => {
    const w = world({ handlerTimeout: true })
    expect(await runAttendanceOpenSequence(w.io, INPUT)).toBe('unconfirmed')
    expect(w.calls).toEqual([`present:${openIdentifier(KEY)}`])
    expect(w.elapsed()).toBeGreaterThanOrEqual(PRESENT_CONFIRM_MS)
  })

  it('a: 配信済みの X が3分以内 → X のまま音なしで置き換え、保留への取り消しは呼ばない（Android 形＝ミリ秒）', async () => {
    const w = world({ delivered: [deliveredStart(new Date(2026, 8, 14, 10, 40).getTime())] })
    expect(await runAttendanceOpenSequence(w.io, INPUT)).toBe('quiet-replaced')
    expect(w.calls).toEqual([`present:${X}`, `record:${X}`])
    expect(w.requests[0]).toMatchObject({ identifier: X, sound: false, data: { tag: 'attendance-open', slotId: X, quiet: true } })
  })

  it('a: 同じ配信時刻を iOS 形（秒）で与えても a になる', async () => {
    const w = world({ delivered: [deliveredStart(new Date(2026, 8, 14, 10, 40).getTime() / 1000)] })
    expect(await runAttendanceOpenSequence(w.io, INPUT)).toBe('quiet-replaced')
  })

  it('a に当たらない（配信から3分を超える）→ b', async () => {
    const w = world({ delivered: [deliveredStart(new Date(2026, 8, 14, 10, 37, 59).getTime())] })
    expect(await runAttendanceOpenSequence(w.io, INPUT)).toBe('announced')
    expect(w.calls[0]).toBe(`present:${openIdentifier(KEY)}`)
  })

  it('c: コマが決まらない → 既定の uuid で提示し、配信済みの開始アラームを科目コードで畳む。取り消さない', async () => {
    const w = world({ timetable: [] })
    expect(await runAttendanceOpenSequence(w.io, INPUT)).toBe('unmatched')
    expect(w.calls).toEqual(['present:uuid', 'clearStart:C1'])
    expect(w.requests[0].identifier).toBeNull()
  })

  it('通知済みのキー・出席画面を見ている間は何もしない（事前判定で止まり、書き込みもしない）', async () => {
    const done = world({ notified: [KEY] })
    expect(await runAttendanceOpenSequence(done.io, INPUT)).toBe('skipped')
    expect(done.calls).toEqual([])
    const focused = world()
    expect(await runAttendanceOpenSequence(focused.io, { ...INPUT, attendanceFocused: true })).toBe('skipped')
    expect(focused.notified()).toEqual([])
  })

  it('2つを同時に投げても（直列キュー＋メモリのストア）、提示は1回だけ（H3）', async () => {
    const q = createWriteQueue()
    const w = world()
    const shared: AttendanceOpenIO = { ...w.io, mutateNotified: (m) => q(() => w.io.mutateNotified(m)) }
    const outcomes = await Promise.all([runAttendanceOpenSequence(shared, INPUT), runAttendanceOpenSequence(shared, INPUT)])
    expect(outcomes.sort()).toEqual(['announced', 'skipped'])
    expect(w.calls.filter((c) => c.startsWith('present:'))).toHaveLength(1)
  })

  it('提示から記録までを出席の直列キューの中で行う', async () => {
    let inQueue = 0
    const w = world({
      queue: async (task) => {
        inQueue++
        return task()
      },
    })
    await runAttendanceOpenSequence(w.io, INPUT)
    expect(inQueue).toBe(1)
  })
})

describe('出席済みの取り下げ（§4.4）', () => {
  function retractionWorld(timetable: TimetableCollection[]) {
    const calls: string[] = []
    const io = {
      enqueue: <T>(task: () => Promise<T>) => {
        calls.push('enqueue')
        return task()
      },
      todayNotices: async () => todaySlotNotices(timetable, NOW),
      markRetracted: (date: string, ids: string[]) => {
        calls.push(`mark:${date}:${ids.join(',')}`)
      },
      cancelScheduled: async (id: string) => {
        calls.push(`cancel:${id}`)
      },
      dismissPresented: async (ids: string[]) => {
        calls.push(`dismiss:${ids.join(',')}`)
      },
    }
    return { io, calls }
  }
  const rec = { date: '2026-09-14', courseName: '線形代数1', confirmWindow: '10:40〜12:10', code: '' }

  it('M2 で当たった開始・終了前を、当日の集合に入れてから保留とトレイの両方から取り下げる', async () => {
    const w = retractionWorld([MON2])
    const ids = await runAttendedRetraction(w.io, { rec, now: NOW })
    expect(ids).toEqual([X, 'att:l:20260914-1200'])
    expect(w.calls).toEqual([
      'enqueue',
      `mark:2026-09-14:${X},att:l:20260914-1200`,
      `cancel:${X}`,
      'cancel:att:l:20260914-1200',
      `dismiss:${X},att:l:20260914-1200`,
    ])
  })

  it('当たらなければ何もしない（終了前は鳴る側）', async () => {
    const w = retractionWorld([MON2])
    expect(await runAttendedRetraction(w.io, { rec: { ...rec, courseName: '物理学1' }, now: NOW })).toEqual([])
    expect(w.calls).toEqual(['enqueue'])
    expect(await runAttendedRetraction(w.io, { rec: null, now: NOW })).toEqual([])
  })
})
