import { describe, expect, it } from 'vitest'
import { isAttendedNow, todayKey, type AttendedRecord } from './attendedState'

const rec = (over: Partial<AttendedRecord> = {}): AttendedRecord => ({
  date: '2026-07-07',
  courseName: '哲学',
  confirmWindow: '12:50〜14:30',
  code: '1234',
  ...over,
})

const at = (h: number, m: number) => new Date(2026, 6, 7, h, m) // 2026-07-07

describe('todayKey', () => {
  it('YYYY-MM-DD（ゼロ詰め）', () => {
    expect(todayKey(new Date(2026, 6, 7, 13, 0))).toBe('2026-07-07')
    expect(todayKey(new Date(2026, 0, 3))).toBe('2026-01-03')
  })
})

describe('isAttendedNow', () => {
  it('nullは常にfalse', () => {
    expect(isAttendedNow(null, at(13, 0))).toBe(false)
  })
  it('受付時間内は出席済み表示', () => {
    expect(isAttendedNow(rec(), at(13, 0))).toBe(true)
  })
  it('受付終了時刻を過ぎたらfalse', () => {
    expect(isAttendedNow(rec(), at(14, 31))).toBe(false)
  })
  it('日付が違えばfalse', () => {
    expect(isAttendedNow(rec({ date: '2026-07-06' }), at(13, 0))).toBe(false)
  })
  it('confirmWindowが無ければ当日中はtrue', () => {
    expect(isAttendedNow(rec({ confirmWindow: null }), at(23, 0))).toBe(true)
  })
})
