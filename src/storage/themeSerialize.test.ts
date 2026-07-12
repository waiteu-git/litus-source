import { describe, it, expect } from 'vitest'
import { serializeTheme, deserializeTheme } from './themeSerialize'

describe('themeSerialize', () => {
  it('4値をそのまま往復する', () => {
    for (const v of ['green', 'white', 'dark', 'system'] as const) {
      expect(deserializeTheme(serializeTheme(v))).toBe(v)
    }
  })
  it('旧glassはgreenへ移行する', () => {
    expect(deserializeTheme('glass')).toBe('green')
  })
  it('未知値・nullは既定whiteへ落ちる', () => {
    expect(deserializeTheme('solid')).toBe('white')
    expect(deserializeTheme(null)).toBe('white')
    expect(deserializeTheme('xxx')).toBe('white')
  })
})
