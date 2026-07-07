import { describe, expect, it } from 'vitest'
import { normalizeAttendanceCode } from './normalizeCode'

describe('normalizeAttendanceCode', () => {
  it('全角数字を半角に変換する', () => {
    expect(normalizeAttendanceCode('１２３４')).toBe('1234')
  })
  it('半角はそのまま', () => {
    expect(normalizeAttendanceCode('5678')).toBe('5678')
  })
  it('全角半角混在と空白・非数字を除去する', () => {
    expect(normalizeAttendanceCode(' １2 ３a4 ')).toBe('1234')
  })
  it('数字が無ければ空文字', () => {
    expect(normalizeAttendanceCode('abc　')).toBe('')
  })
  it('空文字は空文字', () => {
    expect(normalizeAttendanceCode('')).toBe('')
  })
})
