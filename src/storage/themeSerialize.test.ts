import { describe, it, expect } from 'vitest'
import {
  serializeThemeSettings,
  deserializeThemeSettings,
  themePreferenceOf,
  applyThemePreference,
  DEFAULT_THEME_SETTINGS,
  type ThemeSettings,
  type ThemePreference,
} from './themeSerialize'

const s = (light: 'green' | 'white', mode: 'light' | 'dark' | 'auto'): ThemeSettings => ({ light, mode })

describe('themeSettings serialize', () => {
  it('全組み合わせを往復する', () => {
    for (const light of ['green', 'white'] as const) {
      for (const mode of ['light', 'dark', 'auto'] as const) {
        expect(deserializeThemeSettings(serializeThemeSettings(s(light, mode)))).toEqual(s(light, mode))
      }
    }
  })

  it('未保存・壊れ値は既定（白・ライト）', () => {
    expect(deserializeThemeSettings(null)).toEqual(DEFAULT_THEME_SETTINGS)
    expect(deserializeThemeSettings('')).toEqual(DEFAULT_THEME_SETTINGS)
    expect(deserializeThemeSettings('{')).toEqual(DEFAULT_THEME_SETTINGS)
    expect(deserializeThemeSettings('{"light":"x","mode":"y"}')).toEqual(DEFAULT_THEME_SETTINGS)
  })

  it('配列・非オブジェクトJSONは既定', () => {
    expect(deserializeThemeSettings('[]')).toEqual(DEFAULT_THEME_SETTINGS)
  })

  describe('旧形式（素の文字列）からの移行', () => {
    it('green / 旧glass は翠のライト', () => {
      expect(deserializeThemeSettings('green')).toEqual(s('green', 'light'))
      expect(deserializeThemeSettings('glass')).toEqual(s('green', 'light'))
    })

    it('white / 旧solid / 未知値 は白のライト', () => {
      expect(deserializeThemeSettings('white')).toEqual(s('white', 'light'))
      expect(deserializeThemeSettings('solid')).toEqual(s('white', 'light'))
      expect(deserializeThemeSettings('xxx')).toEqual(s('white', 'light'))
    })

    it('dark はダークモード', () => {
      expect(deserializeThemeSettings('dark')).toEqual(s('white', 'dark'))
    })

    it('旧system は自動＋ライト側=白（更新しても表示が変わらない）', () => {
      expect(deserializeThemeSettings('system')).toEqual(s('white', 'auto'))
    })
  })
})

describe('themePreferenceOf', () => {
  it('モードから選択中チップを導出する', () => {
    expect(themePreferenceOf(s('green', 'light'))).toBe('green')
    expect(themePreferenceOf(s('white', 'light'))).toBe('white')
    expect(themePreferenceOf(s('green', 'dark'))).toBe('dark')
    expect(themePreferenceOf(s('green', 'auto'))).toBe('system')
  })
})

describe('applyThemePreference', () => {
  it('翠/白の選択はライト側とモードの両方を確定する', () => {
    expect(applyThemePreference(s('white', 'dark'), 'green')).toEqual(s('green', 'light'))
    expect(applyThemePreference(s('green', 'auto'), 'white')).toEqual(s('white', 'light'))
  })

  it('ダーク・自動を選んでもライト側の選択は消えない（本要望の核心）', () => {
    expect(applyThemePreference(s('green', 'light'), 'dark')).toEqual(s('green', 'dark'))
    expect(applyThemePreference(s('green', 'light'), 'system')).toEqual(s('green', 'auto'))
  })

  it('翠→ダーク→自動 と辿っても自動は翠側を保つ', () => {
    let st = s('white', 'light')
    for (const p of ['green', 'dark', 'system'] as ThemePreference[]) st = applyThemePreference(st, p)
    expect(st).toEqual(s('green', 'auto'))
  })

  it('往復（チップ導出→再適用）で状態が壊れない', () => {
    for (const light of ['green', 'white'] as const) {
      for (const mode of ['light', 'dark', 'auto'] as const) {
        const st = s(light, mode)
        expect(applyThemePreference(st, themePreferenceOf(st))).toEqual(st)
      }
    }
  })
})
