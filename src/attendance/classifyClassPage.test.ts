import { describe, expect, it } from 'vitest'
import { classifyClassPage } from './classifyClassPage'

const base = {
  hasPasswordInput: false,
  hasAttendanceForm: false,
  hasEnterSplash: false,
  hasClassMenu: false,
  hasSystemError: false,
}

describe('classifyClassPage', () => {
  it('パスワード欄があれば login（最優先）', () => {
    expect(classifyClassPage({ ...base, hasPasswordInput: true, hasClassMenu: true })).toBe('login')
  })
  it('出席フォームがあれば attendance', () => {
    expect(classifyClassPage({ ...base, hasAttendanceForm: true })).toBe('attendance')
  })
  it('ENTERスプラッシュは splash（URL直遷移で入場するため portal と区別）', () => {
    expect(classifyClassPage({ ...base, hasEnterSplash: true })).toBe('splash')
  })
  it('CLASSメニューありは portal', () => {
    expect(classifyClassPage({ ...base, hasClassMenu: true })).toBe('portal')
  })
  it('スプラッシュ判定はメニューより優先（両方立ったら splash）', () => {
    expect(classifyClassPage({ ...base, hasEnterSplash: true, hasClassMenu: true })).toBe('splash')
  })
  it('どれも無ければ other', () => {
    expect(classifyClassPage({ ...base })).toBe('other')
  })
  it('システムエラー文言があれば error（login以外に優先）', () => {
    expect(classifyClassPage({ ...base, hasSystemError: true, hasClassMenu: true })).toBe('error')
  })
  it('パスワード欄はエラーより優先（ログインページにエラー文言が乗っても login）', () => {
    expect(classifyClassPage({ ...base, hasPasswordInput: true, hasSystemError: true })).toBe('login')
  })
})
