import { describe, expect, it } from 'vitest'
import { classifyAuthState } from './classifyAuthState'

describe('classifyAuthState', () => {
  it('ログアウトリンクがあり、パスワード入力が無ければ authenticated', () => {
    expect(classifyAuthState({ hasPasswordInput: false, hasLogoutLink: true })).toBe(
      'authenticated',
    )
  })

  it('パスワード入力があれば needsLogin（SSOログインフォーム）', () => {
    expect(classifyAuthState({ hasPasswordInput: true, hasLogoutLink: false })).toBe('needsLogin')
  })

  it('どちらのマーカーも無ければ unknown（読み込み中/中間ページ）', () => {
    expect(classifyAuthState({ hasPasswordInput: false, hasLogoutLink: false })).toBe('unknown')
  })

  it('パスワード入力が最優先（両方あっても needsLogin）', () => {
    expect(classifyAuthState({ hasPasswordInput: true, hasLogoutLink: true })).toBe('needsLogin')
  })
})
