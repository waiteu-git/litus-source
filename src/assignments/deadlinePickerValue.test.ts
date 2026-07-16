import { describe, expect, it } from 'vitest'
import {
  dateToDeadlineDateString,
  dateToDeadlineTimeString,
  deadlineValueToDate,
} from './deadlinePickerValue'

const NOW = new Date(2026, 6, 16, 10, 30) // 2026/07/16 10:30

describe('deadlineValueToDate', () => {
  it('日付・時刻が揃っていればそのままDateへ', () => {
    const d = deadlineValueToDate({ date: '2026/07/20', time: '09:05' }, NOW)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(6)
    expect(d.getDate()).toBe(20)
    expect(d.getHours()).toBe(9)
    expect(d.getMinutes()).toBe(5)
  })

  it('ハイフン区切りの日付も受ける（parseDeadlineInputと同じ許容）', () => {
    const d = deadlineValueToDate({ date: '2026-07-20', time: '23:59' }, NOW)
    expect(d.getDate()).toBe(20)
  })

  it('時刻が不正でも日付が有効なら 23:59 で補完する', () => {
    const d = deadlineValueToDate({ date: '2026/07/20', time: 'xx' }, NOW)
    expect(d.getDate()).toBe(20)
    expect(d.getHours()).toBe(23)
    expect(d.getMinutes()).toBe(59)
  })

  it('日付が空なら now の日付＋入力時刻', () => {
    const d = deadlineValueToDate({ date: '', time: '09:05' }, NOW)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(6)
    expect(d.getDate()).toBe(16)
    expect(d.getHours()).toBe(9)
    expect(d.getMinutes()).toBe(5)
  })

  it('日付も時刻も不正なら now の日付＋23:59', () => {
    const d = deadlineValueToDate({ date: '2026/02/31', time: 'zz' }, NOW)
    expect(d.getDate()).toBe(16)
    expect(d.getHours()).toBe(23)
    expect(d.getMinutes()).toBe(59)
  })
})

describe('dateToDeadlineDateString / dateToDeadlineTimeString', () => {
  it('ゼロ埋めの "YYYY/MM/DD" と "HH:mm" を返す', () => {
    const d = new Date(2026, 0, 5, 8, 7)
    expect(dateToDeadlineDateString(d)).toBe('2026/01/05')
    expect(dateToDeadlineTimeString(d)).toBe('08:07')
  })

  it('parseDeadlineInput と往復できる（picker→文字列→ISO）', () => {
    const d = new Date(2026, 11, 31, 23, 59)
    const date = dateToDeadlineDateString(d)
    const time = dateToDeadlineTimeString(d)
    const back = deadlineValueToDate({ date, time }, NOW)
    expect(back.getTime()).toBe(d.getTime())
  })
})
