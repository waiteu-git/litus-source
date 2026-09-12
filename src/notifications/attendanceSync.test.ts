import { describe, expect, it } from 'vitest'
import {
  computeAttendanceAlarms,
  startOfLocalDay,
  upcomingAttendanceNotices,
  type CancelledClass,
} from './attendanceSchedule'
import { planAttendanceNotices } from './attendanceSync'
import { staggerSameInstant, DEFAULT_STAGGER_STEP_MS } from './staggerFireAt'
import type { TimetableCollection } from '../collect/timetableMessage'
import type { CourseTermInfo } from '../attendance/courseOver'
import {
  isSchedulable,
  planAttendanceSync,
  runScheduleLoop,
  syncAttendanceWith,
  toAttendanceScheduleItems,
  type PendingRequestLike,
} from './attendanceSync'
import type { AttendanceNotice } from './attendanceSchedule'
import {
  addScheduleFailures,
  enqueueAttendanceNotif,
  markRetracted,
  resetAttendanceNotifStateForTest,
  retractedFor,
  scheduleFailures,
} from './attendanceNotifState'

const cls = (courseCode: string, name: string) => ({
  courseCode, name, teachers: [], room: 'K101', isRemote: false, credits: 2, badges: [],
})
const PERIODS = [
  { period: 1, start: '09:00', end: '10:30' },
  { period: 2, start: '10:40', end: '12:10' },
  { period: 3, start: '13:00', end: '14:30' },
  { period: 4, start: '14:40', end: '16:10' },
  { period: 5, start: '16:20', end: '17:50' },
]
/** 1週間ぶん（2026-09-14 月〜）。積みコマ・連続コマ・休講・科目別OFF・学期終了・長さの違う積みコマを含む。 */
const WEEK: TimetableCollection = {
  periodTimes: { campus: '野田', periods: PERIODS },
  slots: [
    { day: 'mon', period: 2, classes: [cls('Q1', '情報科学概論A'), cls('Q2', '情報科学概論B')] },
    { day: 'tue', period: 4, classes: [cls('L1', '物理学実験Ａ')] },
    { day: 'tue', period: 5, classes: [cls('L1', '物理学実験Ａ')] },
    { day: 'wed', period: 1, classes: [cls('C1', '線形代数1')] },
    { day: 'wed', period: 3, classes: [cls('C2', '物理学1')] },
    { day: 'thu', period: 1, classes: [cls('D1', '英語')] },
    { day: 'thu', period: 3, classes: [cls('X1', '化学実験'), cls('X2', '化学演習')] },
    { day: 'thu', period: 4, classes: [cls('X1', '化学実験')] },
    { day: 'fri', period: 2, classes: [cls('E1', '終わった科目')] },
    { day: 'fri', period: 5, classes: [cls('F1', '統計学')] },
  ],
}
const SETTINGS = { D1: false }
const CANCELLED: CancelledClass[] = [{ date: '2026-09-16', periods: [1], courseCode: 'C1', courseName: '線形代数1' }]
const TERM: CourseTermInfo = { termEnds: { E1: '2026-09-11' }, nameOwners: {}, extraPlans: [], calendar: null }
/** 月2限の授業中（開始 10:40 は過ぎ、終了前 12:00 はまだ）。 */
const NOW = new Date(2026, 8, 14, 11, 0, 0, 0)

const keyOf = (x: { kind: string; fireAt: string }) => `${x.kind}|${x.fireAt}`

/** 貼り直し（notificationRefresh）と同じ組み立て。 */
function n1Schedule(now: Date, excluded: ReadonlySet<string> = new Set()) {
  const alarms = computeAttendanceAlarms([WEEK], SETTINGS, startOfLocalDay(now), {}, CANCELLED, TERM)
  return planAttendanceNotices({ notices: upcomingAttendanceNotices(alarms, now), others: [], now, excluded }).attendance
}

describe('🔴 T1 アプリを閉じている世界で、鳴る時刻の集合が1つも減らない（N1 禁止事項8）', () => {
  const before = computeAttendanceAlarms([WEEK], SETTINGS, NOW, {}, CANCELLED, TERM)

  it('今の {種類, 時刻} の集合と、N1 の予約集合の {種類, ずらす前の時刻} が一致する', () => {
    expect(new Set(n1Schedule(NOW).map(keyOf))).toEqual(new Set(before.map(keyOf)))
  })

  it('まとめた分だけ件数は減る（積みコマの2通が1通）', () => {
    expect(n1Schedule(NOW).length).toBeLessThan(before.length)
  })

  it('始まっている授業の終了前も残る（月2限 12:00）', () => {
    expect(n1Schedule(NOW).map(keyOf)).toContain(
      `attendance-last-chance|${new Date(2026, 8, 14, 12, 0).toISOString()}`,
    )
  })

  it('陰性の対照: 受付open 済みを1つ入れると、その開始の1つだけが減る', () => {
    const after = new Set(n1Schedule(NOW, new Set(['att:s:20260915-1440'])).map(keyOf))
    const lost = [...new Set(before.map(keyOf))].filter((k) => !after.has(k))
    expect(lost).toEqual([`attendance-start|${new Date(2026, 8, 15, 14, 40).toISOString()}`])
  })
})

describe('T6 identifier は貼り直しをまたいで同じ・ずらしても変わらない・1週間で重複しない', () => {
  const ids = (now: Date) => n1Schedule(now).map((n) => n.id)

  it('now を変えて2回作っても同じ（8:00 と 9:30 の間に鳴る枠は無い）', () => {
    expect(ids(new Date(2026, 8, 14, 8, 0))).toEqual(ids(new Date(2026, 8, 14, 9, 30)))
  })

  it('形は att:s:/att:l:＋日付＋ずらす前の時刻（時限番号を含まない）', () => {
    const all = ids(NOW)
    expect(all).toContain('att:l:20260914-1200')
    expect(all).toContain('att:s:20260917-1300')
    for (const id of all) expect(id).toMatch(/^att:[sl]:\d{8}-\d{4}$/)
  })

  it('1週間の中で重複しない', () => {
    const all = ids(NOW)
    expect(new Set(all).size).toBe(all.length)
  })

  it('ずらしても id は変わらない（開始と終了前がたまたま同じ時刻になった時だけずれる）', () => {
    // 1限の終了前（10:40 終了の10分前＝10:30）と、10:30 開始の2限が同じ時刻になる。
    const col: TimetableCollection = {
      periodTimes: { campus: '野田', periods: [{ period: 1, start: '09:00', end: '10:40' }, { period: 2, start: '10:30', end: '12:00' }] },
      slots: [{ day: 'mon', period: 1, classes: [cls('A', 'A')] }, { day: 'mon', period: 2, classes: [cls('B', 'B')] }],
    }
    const now = new Date(2026, 8, 14, 8, 0)
    const notices = upcomingAttendanceNotices(computeAttendanceAlarms([col], {}, startOfLocalDay(now), { daysAhead: 1 }), now)
    const staggered = staggerSameInstant(notices, DEFAULT_STAGGER_STEP_MS, (n) => n.id)
    expect(staggered.map((n) => n.id)).toEqual(notices.map((n) => n.id))
    expect(staggered.find((n) => n.id === 'att:l:20260914-1030')!.fireAt).toBe(new Date(2026, 8, 14, 10, 30, 0).toISOString())
    expect(staggered.find((n) => n.id === 'att:s:20260914-1030')!.fireAt).toBe(new Date(2026, 8, 14, 10, 30, 20).toISOString())
  })
})

const NOW_MS = new Date(2026, 8, 14, 10, 0, 0).getTime()
const at = (sec: number) => new Date(NOW_MS + sec * 1000).toISOString()
const item = (id: string, sec: number) => ({ id, fireAt: at(sec) })

describe('T7 planAttendanceSync / isSchedulable（差分同期の判断）', () => {
  it('集合に無い保留は、時刻を問わず取り消す（旧版の uuid を含む）', () => {
    const r = planAttendanceSync(['3f2a-uuid', 'att:s:20260914-1040'], [item('att:s:20260914-1040', 2400)], NOW_MS)
    expect(r.cancel).toEqual(['3f2a-uuid'])
    expect(r.schedule.map((s) => s.id)).toEqual(['att:s:20260914-1040'])
  })

  it('空の集合なら全部取り消す（キルスイッチ all の出口）', () => {
    expect(planAttendanceSync(['a', 'b'], [], NOW_MS)).toEqual({ cancel: ['a', 'b'], schedule: [] })
  })

  it('同じ identifier の保留: 発火まで10秒以上なら予約し直す・10秒未満なら触らない（取り消しもしない）', () => {
    const r = planAttendanceSync(['x', 'y'], [item('x', 10), item('y', 9)], NOW_MS)
    expect(r.schedule.map((s) => s.id)).toEqual(['x'])
    expect(r.cancel).toEqual([])
  })

  it('保留に無いもの: 2秒以上先なら予約・2秒未満なら予約しない', () => {
    const r = planAttendanceSync([], [item('p', 2), item('q', 1)], NOW_MS)
    expect(r.schedule.map((s) => s.id)).toEqual(['p'])
  })

  it('陰性の対照: 保留に無く発火まで5秒 → 予約する（10秒の窓で落とさない）', () => {
    expect(planAttendanceSync([], [item('n', 5)], NOW_MS).schedule.map((s) => s.id)).toEqual(['n'])
  })

  it('isSchedulable の境界と壊れた時刻', () => {
    expect(isSchedulable(at(10), NOW_MS, true)).toBe(true)
    expect(isSchedulable(at(9.999), NOW_MS, true)).toBe(false)
    expect(isSchedulable(at(2), NOW_MS, false)).toBe(true)
    expect(isSchedulable(at(1.999), NOW_MS, false)).toBe(false)
    expect(isSchedulable(at(-60), NOW_MS, false)).toBe(false)
    expect(isSchedulable('not-a-date', NOW_MS, false)).toBe(false)
  })
})

describe('T8 1件ずつの try/catch と直前の除外', () => {
  it('3件目で失敗しても4件目以降が予約され、失敗の数は1', async () => {
    const done: string[] = []
    const items = [1, 2, 3, 4, 5].map((i) => item(`i${i}`, 60 * i))
    const r = await runScheduleLoop(items, {
      isPending: () => false,
      clock: () => NOW_MS,
      schedule: async (x) => {
        if (x.id === 'i3') throw new Error('reject')
        done.push(x.id)
      },
    })
    expect(done).toEqual(['i1', 'i2', 'i4', 'i5'])
    expect(r).toEqual({ scheduled: 4, skipped: 0, failed: 1 })
  })

  it('過去・2秒以内の fireAt は予約関数に渡らない（時計は1件ごとに注入から取る）', async () => {
    let t = NOW_MS
    const seen: string[] = []
    const items = [item('past', -5), item('near', 1), item('ok', 30), item('late', 31)]
    // ok を予約する間に時計が30秒進む＝late は予約の直前に取り直した時刻で1秒先になり、除外される。
    const r = await runScheduleLoop(items, {
      isPending: () => false,
      clock: () => t,
      schedule: async (x) => {
        seen.push(x.id)
        t += 30_000
      },
    })
    expect(seen).toEqual(['ok'])
    expect(r).toEqual({ scheduled: 1, skipped: 3, failed: 0 })
  })

  it('課題の側（isPending は常に偽）: 10秒の窓を使わない＝発火まで5秒の課題は予約される', async () => {
    const seen: string[] = []
    await runScheduleLoop([{ fireAt: at(5) }], { isPending: () => false, clock: () => NOW_MS, schedule: async () => { seen.push('x') } })
    expect(seen).toEqual(['x'])
  })
})

describe('syncAttendanceWith（差分同期の組み立て・禁止事項7）', () => {
  function world(pending: PendingRequestLike[], failOn?: string) {
    const log: string[] = []
    return {
      log,
      io: {
        getPending: async () => pending,
        cancel: async (id: string) => { log.push(`cancel:${id}`) },
        schedule: async (x: { id: string; fireAt: string }) => {
          if (x.id === failOn) throw new Error('reject')
          log.push(`schedule:${x.id}`)
        },
        clock: () => NOW_MS,
      },
    }
  }
  const att = (identifier: string, extra: Record<string, unknown> = {}): PendingRequestLike => ({
    identifier,
    data: { tag: 'attendance-alarm', ...extra },
  })

  it('空の集合なら出席タグの保留を全部取り消し、他のタグには触らない（キルスイッチ all）', async () => {
    const w = world([att('old-uuid'), att('att:s:20260914-1040'), { identifier: 'asg-1', data: { tag: 'assignment-reminder' } }])
    const r = await syncAttendanceWith([], w.io)
    expect(w.log).toEqual(['cancel:old-uuid', 'cancel:att:s:20260914-1040'])
    expect(r.cancelled).toBe(2)
  })

  it('取り消し → 予約の順。10秒以内の同じ identifier は触らない', async () => {
    const w = world([att('old-uuid'), att('att:s:20260914-1000')])
    await syncAttendanceWith([item('att:s:20260914-1000', 5), item('att:l:20260914-1120', 4800)], w.io)
    expect(w.log).toEqual(['cancel:old-uuid', 'schedule:att:l:20260914-1120'])
  })

  it('保留に発火時刻が無い iOS 形でも、有る Android 形でも同じ結果', async () => {
    const desired = [item('att:s:20260914-1040', 2400)]
    const ios = world([att('att:s:20260914-1040'), att('x')])
    const android = world([att('att:s:20260914-1040', { fireAt: at(2400) }), att('x', { fireAt: at(60) })])
    await syncAttendanceWith(desired, ios.io)
    await syncAttendanceWith(desired, android.io)
    expect(ios.log).toEqual(android.log)
  })

  it('1件の失敗で止まらず、失敗を数える', async () => {
    const w = world([], 'b')
    const r = await syncAttendanceWith([item('a', 60), item('b', 120), item('c', 180)], w.io)
    expect(w.log).toEqual(['schedule:a', 'schedule:c'])
    expect(r.failed).toBe(1)
  })
})

describe('予約項目（題名と payload・§4.7）', () => {
  it('courseCode・kind は残し、courseCodes・courseNames・date・span・fireAt（ずらした後）を足す', () => {
    const n: AttendanceNotice = {
      id: 'att:s:20260914-1040',
      kind: 'attendance-start',
      fireAt: new Date(2026, 8, 14, 10, 40, 20).toISOString(),
      date: '2026-09-14',
      span: '10:40-12:10',
      courses: [
        { courseCode: 'Q1', courseName: '情報科学概論A' },
        { courseCode: 'Q2', courseName: '情報科学概論B' },
      ],
    }
    const [x] = toAttendanceScheduleItems([n], { overrides: {}, manualQuarter: null, resolvedQuarter: 'first' })
    expect(x).toEqual({
      id: 'att:s:20260914-1040',
      fireAt: n.fireAt,
      title: '情報科学概論A／情報科学概論B 出席コード',
      body: '授業が始まりました。出席コードを入力できるか確認しましょう',
      data: {
        tag: 'attendance-alarm',
        kind: 'attendance-start',
        courseCode: 'Q1',
        courseCodes: ['Q1', 'Q2'],
        courseNames: ['情報科学概論A', '情報科学概論B'],
        date: '2026-09-14',
        span: '10:40-12:10',
        fireAt: n.fireAt,
      },
    })
  })
})

describe('出席通知のプロセス内の状態（§4.4-4.6）', () => {
  it('取り下げた枠は当日の分だけを返し、日付が変われば捨てる', () => {
    resetAttendanceNotifStateForTest()
    markRetracted('2026-09-14', ['att:s:20260914-1040'])
    markRetracted('2026-09-14', ['att:l:20260914-1200'])
    expect(retractedFor('2026-09-14').sort()).toEqual(['att:l:20260914-1200', 'att:s:20260914-1040'])
    markRetracted('2026-09-15', ['att:s:20260915-0900'])
    expect(retractedFor('2026-09-14')).toEqual([])
    expect(retractedFor('2026-09-15')).toEqual(['att:s:20260915-0900'])
  })

  it('予約失敗の数を足していく（0以下は足さない）', () => {
    resetAttendanceNotifStateForTest()
    addScheduleFailures(2)
    addScheduleFailures(0)
    expect(scheduleFailures()).toBe(2)
  })

  it('出席の直列キューは投げた順に1本ずつ実行する（前の仕事が終わるまで次を始めない）', async () => {
    const order: string[] = []
    const first = enqueueAttendanceNotif(async () => {
      order.push('a:start')
      await new Promise((r) => setTimeout(r, 5))
      order.push('a:end')
    })
    const second = enqueueAttendanceNotif(async () => {
      order.push('b')
    })
    await Promise.all([first, second])
    expect(order).toEqual(['a:start', 'a:end', 'b'])
  })
})
