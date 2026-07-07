import { describe, expect, it } from 'vitest'
import { classifyClassPage } from './classifyClassPage'

const base = { hasPasswordInput: false, hasAttendanceForm: false, hasEnterSplash: false, hasClassMenu: false }

describe('classifyClassPage', () => {
  it('パスワード欄があれば login（最優先）', () => {
    expect(classifyClassPage({ ...base, hasPasswordInput: true, hasClassMenu: true })).toBe('login')
  })
  it('出席フォームがあれば attendance', () => {
    expect(classifyClassPage({ ...base, hasAttendanceForm: true })).toBe('attendance')
  })
  it('ENTERスプラッシュは portal', () => {
    expect(classifyClassPage({ ...base, hasEnterSplash: true })).toBe('portal')
  })
  it('CLASSメニューありは portal', () => {
    expect(classifyClassPage({ ...base, hasClassMenu: true })).toBe('portal')
  })
  it('どれも無ければ other', () => {
    expect(classifyClassPage({ ...base })).toBe('other')
  })
})
