import { describe, it, expect } from 'vitest'
import { mondayOf, weekDates, weekRangeLabel, dayHeadLabel } from './weekDates'

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const

describe('mondayOf', () => {
  it('週の途中（水曜 2026-07-15）はその週の月曜 2026-07-13 を返す', () => {
    const m = mondayOf(new Date(2026, 6, 15)) // 7/15 水
    expect([m.getFullYear(), m.getMonth(), m.getDate()]).toEqual([2026, 6, 13])
  })
  it('月曜自身はその日を返す', () => {
    const m = mondayOf(new Date(2026, 6, 13)) // 7/13 月
    expect(m.getDate()).toBe(13)
  })
  it('日曜（2026-07-19）は同じ週の月曜 7/13 へ寄せる', () => {
    const m = mondayOf(new Date(2026, 6, 19)) // 7/19 日
    expect(m.getDate()).toBe(13)
  })
  it('月をまたぐ週（水曜 2026-04-01）は前月の月曜 3/30 を返す', () => {
    const m = mondayOf(new Date(2026, 3, 1)) // 4/1 水
    expect([m.getMonth(), m.getDate()]).toEqual([2, 30]) // 3月=index2, 30日
  })
})

describe('weekDates', () => {
  it('水曜基準で月〜日の日付が 13..19 になる', () => {
    const wd = weekDates(new Date(2026, 6, 15))
    expect(wd.mon.getDate()).toBe(13)
    expect(wd.tue.getDate()).toBe(14)
    expect(wd.wed.getDate()).toBe(15)
    expect(wd.fri.getDate()).toBe(17)
    expect(wd.sun.getDate()).toBe(19)
  })
})

describe('weekRangeLabel', () => {
  it('平日のみ表示なら月〜金の範囲', () => {
    expect(weekRangeLabel(new Date(2026, 6, 15), WEEKDAYS)).toBe('7月13日〜7月17日')
  })
  it('土曜込みなら土曜まで', () => {
    const withSat = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
    expect(weekRangeLabel(new Date(2026, 6, 15), withSat)).toBe('7月13日〜7月18日')
  })
  it('1日だけなら単日表記', () => {
    expect(weekRangeLabel(new Date(2026, 6, 15), ['wed'])).toBe('7月15日')
  })
  it('空配列なら空文字', () => {
    expect(weekRangeLabel(new Date(2026, 6, 15), [])).toBe('')
  })
})

describe('dayHeadLabel', () => {
  it('M月D日（曜）形式', () => {
    expect(dayHeadLabel(new Date(2026, 6, 13), '月')).toBe('7月13日（月）')
  })
})
