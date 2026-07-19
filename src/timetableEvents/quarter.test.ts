import { describe, it, expect } from 'vitest'
import type { TimetableClass, TimetableSlot } from '../parsers/timetable'
import {
  isQuarterSlot,
  defaultCurrentQuarter,
  resolveCurrentQuarter,
  isDimmedForCurrentQuarter,
  applyQuarterOverrides,
  representativeClass,
} from './quarter'

const cls = (courseCode: string, name: string, quarter?: 'first' | 'second'): TimetableClass => ({
  courseCode, name, teachers: [], room: '', isRemote: false, credits: null, badges: [], ...(quarter ? { quarter } : {}),
})
const slot = (classes: TimetableClass[]): TimetableSlot => ({ day: 'mon', period: 1, classes })

describe('isQuarterSlot', () => {
  it('2科目以上で true', () => {
    expect(isQuarterSlot(slot([cls('a', 'A'), cls('b', 'B')]))).toBe(true)
    expect(isQuarterSlot(slot([cls('a', 'A')]))).toBe(false)
  })
})

describe('defaultCurrentQuarter', () => {
  it('4/5/10/11月は first', () => {
    for (const m of [4, 5, 10, 11]) expect(defaultCurrentQuarter(new Date(2026, m - 1, 15))).toBe('first')
  })
  it('6-9/12-3月は second', () => {
    for (const m of [6, 7, 8, 9, 12, 1, 2, 3]) expect(defaultCurrentQuarter(new Date(2026, m - 1, 15))).toBe('second')
  })
})

describe('resolveCurrentQuarter', () => {
  it('pref があれば最優先', () => {
    expect(resolveCurrentQuarter('second', new Date(2026, 3, 15))).toBe('second') // 4月でも pref 優先
  })
  it('pref null は日付既定', () => {
    expect(resolveCurrentQuarter(null, new Date(2026, 3, 15))).toBe('first')
  })
})

describe('isDimmedForCurrentQuarter', () => {
  it('積み・指定済み・現在半期と異なるときだけ true', () => {
    expect(isDimmedForCurrentQuarter('second', 'first', true)).toBe(true)
    expect(isDimmedForCurrentQuarter('first', 'first', true)).toBe(false)
    expect(isDimmedForCurrentQuarter(undefined, 'first', true)).toBe(false)
    expect(isDimmedForCurrentQuarter('second', 'first', false)).toBe(false)
  })
})

describe('applyQuarterOverrides', () => {
  it('courseCode 一致に quarter をマージ（他は不変）', () => {
    const slots = [slot([cls('a1', 'A'), cls('b1', 'B')])]
    const out = applyQuarterOverrides(slots, { a1: { quarter: 'first' } })
    expect(out[0].classes[0].quarter).toBe('first')
    expect(out[0].classes[1].quarter).toBeUndefined()
  })
})

describe('representativeClass', () => {
  it('単一科目はその科目', () => {
    expect(representativeClass([cls('a', 'A')])?.courseCode).toBe('a')
  })
  it('積みは現在半期に一致する科目', () => {
    const r = representativeClass([cls('a', 'A', 'first'), cls('b', 'B', 'second')], 'second')
    expect(r?.courseCode).toBe('b')
  })
  it('一致無し/現在半期未指定は先頭', () => {
    expect(representativeClass([cls('a', 'A', 'first'), cls('b', 'B', 'first')], 'second')?.courseCode).toBe('a')
    expect(representativeClass([cls('a', 'A'), cls('b', 'B')])?.courseCode).toBe('a')
  })
  it('片方だけ半期指定の積みは、非該当(薄字)側でなく未指定(実施)側を代表に選ぶ', () => {
    // A=first(現在半期=secondなので非該当・薄字), B=未指定(薄字にならない) → B が代表。
    const r = representativeClass([cls('a', 'A', 'first'), cls('b', 'B')], 'second')
    expect(r?.courseCode).toBe('b')
  })
})
