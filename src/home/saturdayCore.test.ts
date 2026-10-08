import { describe, expect, it } from 'vitest'
import { pickFocusClass, todayRemainingClasses } from './focusClass'
import { findActiveClass } from '../attendance/homeBanner'
import { isInActiveClassPeriod } from '../attendance/classPeriod'
import { computeAttendanceAlarms, todaySlotNotices } from '../notifications/attendanceSchedule'
import { buildWidgetModel } from '../widget/viewModel'
import { defaultWeekMonday } from '../timetableEvents/weekNav'
import { weekDates } from '../timetableEvents/weekDates'
import { parseTimetable } from '../parsers/timetable'
import { CELL_FILLED, TABLE_MINIMAL } from '../parsers/timetable.fixtures'
import type { TimetableCollection } from '../collect/timetableMessage'

/**
 * 土曜の授業が「その日」として扱われること（中核の層）。
 * LTW で「CLASS の時間割は月〜土の6列で取り込み・保存できていたのに、表示側が土曜を落としていた」不具合が見つかった（LTW v1.4.4 で修正）。
 * リタスは曜日表が {mon:1…sat:6} で一貫しており同じ型は無い（2026-10-08 に全域を読んで確認）。
 * ただし画面側以外（今日のコマ・ホームのバナー・ウィジェット・出席の予約通知・パーサの土曜の列）に土曜のテストが無かったので、
 * 将来の変更で曜日表の一部だけが月〜金になっても気づけるよう、ここで押さえる（挙動は変えない）。
 * 月曜を陽性の対照、月↔土の取り違えを負の対照にする。
 */

// 2026-07-11 は土曜・2026-07-06 は月曜（2026-07-09 が木曜）。
const SAT = (h: number, m = 0) => new Date(2026, 6, 11, h, m)
const MON = (h: number, m = 0) => new Date(2026, 6, 6, h, m)

const periodTimes = {
  campus: '葛飾',
  periods: [
    { period: 1, start: '09:00', end: '10:40' },
    { period: 2, start: '10:50', end: '12:30' },
    { period: 3, start: '13:00', end: '14:40' },
  ],
}
const cls = (name: string) => ({
  courseCode: name,
  name,
  teachers: ['佐藤'],
  room: 'K404',
  isRemote: false,
  credits: null,
  badges: [],
})
const cols = (day: 'mon' | 'sat'): TimetableCollection[] => [
  { slots: [{ day, period: 2, classes: [cls('土曜の授業')] }], periodTimes },
]

describe('土曜の授業は、土曜に「今日の授業」として扱われる（月曜の授業が月曜に扱われるのと同じに）', () => {
  it.each([
    ['月曜の授業を月曜に（陽性の対照）', 'mon', MON],
    ['土曜の授業を土曜に', 'sat', SAT],
  ] as const)('%s: 今日のコマ・進行中・出席の時間帯・ホームのバナー・予約通知', (_label, day, at) => {
    const c = cols(day)
    const focus = pickFocusClass(c, at(11, 0))
    expect(focus?.name).toBe('土曜の授業')
    expect(focus?.isNow).toBe(true)
    expect(todayRemainingClasses(c, at(9, 0))).toHaveLength(1)
    expect(findActiveClass(c, at(11, 0))?.courseName).toBe('土曜の授業')
    expect(isInActiveClassPeriod(c, at(11, 0), () => true)).toBe(true)
    expect(computeAttendanceAlarms(c, {}, at(0, 0), { daysAhead: 1 }).length).toBeGreaterThan(0)
    expect(todaySlotNotices(c, at(0, 0)).length).toBeGreaterThan(0)
  })

  it('負の対照: 土曜の授業は月曜に出ず、月曜の授業は土曜に出ない（曜日の取り違えを検知する）', () => {
    expect(pickFocusClass(cols('sat'), MON(11, 0))).toBeNull()
    expect(pickFocusClass(cols('mon'), SAT(11, 0))).toBeNull()
    expect(computeAttendanceAlarms(cols('sat'), {}, MON(0, 0), { daysAhead: 1 })).toHaveLength(0)
  })

  it('ウィジェットの「次の授業」と「このあとの授業」に、土曜の授業が出る（このあと＝viewModel 自前の曜日表を通る）', () => {
    const two: TimetableCollection[] = [
      {
        slots: [
          { day: 'sat', period: 2, classes: [cls('土曜の1つ目')] },
          { day: 'sat', period: 3, classes: [cls('土曜の2つ目')] },
        ],
        periodTimes,
      },
    ]
    const m = buildWidgetModel(SAT(9, 0), two, [], null)
    expect(m.todayLabel).toContain('土')
    expect(m.nextClass?.name).toBe('土曜の1つ目')
    expect(m.laterClasses.map((c) => c.name)).toEqual(['土曜の2つ目'])
    // 負の対照: 同じ時間割でも月曜の朝には何も出ない
    const mon = buildWidgetModel(MON(9, 0), two, [], null)
    expect(mon.nextClass).toBeNull()
    expect(mon.laterClasses).toEqual([])
  })

  it('予約通知は7日先まで見て、土曜の授業を落とさない（月曜から数えて6日目）', () => {
    const alarms = computeAttendanceAlarms(cols('sat'), {}, MON(0, 0), { daysAhead: 7 })
    expect(alarms.length).toBeGreaterThan(0)
  })
})

describe('土曜は「今週」に属し、翌週へ寄らない（日曜だけが翌週の起点）', () => {
  it('土曜の既定の週は今週の月曜・土曜の実日付は今週の土曜', () => {
    expect(defaultWeekMonday(SAT(10)).getDate()).toBe(6)
    expect(weekDates(SAT(10)).sat.getDate()).toBe(11)
  })
})

describe('CLASS の6列表（月〜土）の土曜の列が、sat のコマとして取り込まれる', () => {
  it('1限の行の最後（6番目）の列に授業があると sat1 になる', () => {
    const empty = '<td class="colYobi"><div class="jugyo-info jugyo-normal noClass"></div></td>'
    const i = TABLE_MINIMAL.indexOf('<td class="colJigen ui-widget-header">1</td>')
    const j = TABLE_MINIMAL.indexOf('</tr>', i)
    const row = TABLE_MINIMAL.slice(i, j)
    const k = row.lastIndexOf(empty)
    expect(k).toBeGreaterThan(0)
    const html =
      TABLE_MINIMAL.slice(0, i) +
      row.slice(0, k) +
      `<td class="colYobi">${CELL_FILLED}</td>` +
      row.slice(k + empty.length) +
      TABLE_MINIMAL.slice(j)
    const keys = parseTimetable(html).map((s) => `${s.day}${s.period}`)
    expect(keys).toContain('sat1')
    expect(keys).toContain('mon1')
    // 差し替えなければ sat は無い（負の対照）
    expect(parseTimetable(TABLE_MINIMAL).some((s) => s.day === 'sat')).toBe(false)
  })
})
