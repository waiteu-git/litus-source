import { describe, expect, it } from 'vitest'
import { deserializeTheme, serializeTheme } from './themeSerialize'

describe('themeSerialize', () => {
  it('green を保存・復元', () => {
    expect(deserializeTheme(serializeTheme('green'))).toBe('green')
  })
  it('white を保存・復元', () => {
    expect(deserializeTheme(serializeTheme('white'))).toBe('white')
  })
  it('旧glassはgreenへ移行', () => {
    expect(deserializeTheme('glass')).toBe('green')
  })
  it('旧solidはwhiteへ移行', () => {
    expect(deserializeTheme('solid')).toBe('white')
  })
  it('null/不正は既定white（標準テーマは白）', () => {
    expect(deserializeTheme(null)).toBe('white')
    expect(deserializeTheme('xyz')).toBe('white')
  })
})
