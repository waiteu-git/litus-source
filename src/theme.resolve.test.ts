import { describe, it, expect } from 'vitest'
import { resolveVariant } from './theme.resolve'
import type { ThemeSettings } from './storage/themeSerialize'

const s = (light: 'green' | 'white', mode: 'light' | 'dark' | 'auto'): ThemeSettings => ({ light, mode })

describe('resolveVariant', () => {
  it('固定モードはOSに関係なくその値', () => {
    expect(resolveVariant(s('green', 'light'), 'dark')).toBe('green')
    expect(resolveVariant(s('white', 'light'), 'dark')).toBe('white')
    expect(resolveVariant(s('green', 'dark'), 'light')).toBe('dark')
    expect(resolveVariant(s('white', 'dark'), 'light')).toBe('dark')
  })

  describe('自動', () => {
    it('OSダークならダーク', () => {
      expect(resolveVariant(s('green', 'auto'), 'dark')).toBe('dark')
      expect(resolveVariant(s('white', 'auto'), 'dark')).toBe('dark')
    })

    it('OSライトなら選んでいたライトテーマへ戻る（白固定にしない）', () => {
      expect(resolveVariant(s('green', 'auto'), 'light')).toBe('green')
      expect(resolveVariant(s('white', 'auto'), 'light')).toBe('white')
    })

    it('OSスキーム不明はライト扱い＝選んでいたライトテーマ', () => {
      expect(resolveVariant(s('green', 'auto'), null)).toBe('green')
      expect(resolveVariant(s('green', 'auto'), undefined)).toBe('green')
      expect(resolveVariant(s('white', 'auto'), null)).toBe('white')
      expect(resolveVariant(s('white', 'auto'), undefined)).toBe('white')
    })
  })
})
