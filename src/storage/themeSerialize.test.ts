import { describe, expect, it } from 'vitest'
import { deserializeTheme, serializeTheme } from './themeSerialize'

describe('themeSerialize', () => {
  it('solid を保存・復元', () => {
    expect(deserializeTheme(serializeTheme('solid'))).toBe('solid')
  })
  it('glass を保存・復元', () => {
    expect(deserializeTheme(serializeTheme('glass'))).toBe('glass')
  })
  it('null は既定 glass', () => {
    expect(deserializeTheme(null)).toBe('glass')
  })
  it('不正値は既定 glass', () => {
    expect(deserializeTheme('xyz')).toBe('glass')
  })
})
