import { describe, it, expect } from 'vitest'
import { FONT, fontFamilyForWeight, toPlexStyle } from './fontFamily'

describe('fontFamilyForWeight', () => {
  it('未指定・normal・400以下は Regular', () => {
    expect(fontFamilyForWeight(undefined)).toBe(FONT.regular)
    expect(fontFamilyForWeight('normal')).toBe(FONT.regular)
    expect(fontFamilyForWeight('400')).toBe(FONT.regular)
    expect(fontFamilyForWeight(400)).toBe(FONT.regular)
    expect(fontFamilyForWeight('300')).toBe(FONT.regular)
    expect(fontFamilyForWeight('100')).toBe(FONT.regular)
  })

  it('500 は Medium', () => {
    expect(fontFamilyForWeight('500')).toBe(FONT.medium)
    expect(fontFamilyForWeight(500)).toBe(FONT.medium)
  })

  it('600以上・bold は Bold（600/800/900 は 700 に寄せる）', () => {
    expect(fontFamilyForWeight('600')).toBe(FONT.bold)
    expect(fontFamilyForWeight('700')).toBe(FONT.bold)
    expect(fontFamilyForWeight('800')).toBe(FONT.bold)
    expect(fontFamilyForWeight('900')).toBe(FONT.bold)
    expect(fontFamilyForWeight('bold')).toBe(FONT.bold)
    expect(fontFamilyForWeight(700)).toBe(FONT.bold)
  })
})

describe('toPlexStyle', () => {
  it('flatten済みstyleに fontFamily を付与し fontWeight を除去する', () => {
    expect(toPlexStyle({ fontSize: 14, fontWeight: '600', color: '#000' })).toEqual({
      fontSize: 14,
      color: '#000',
      fontFamily: FONT.bold,
      fontWeight: undefined,
    })
  })

  it('fontWeight が無い style は Regular を付与する', () => {
    expect(toPlexStyle({ fontSize: 12 })).toEqual({
      fontSize: 12,
      fontFamily: FONT.regular,
      fontWeight: undefined,
    })
  })

  it('style 未指定（null/undefined）でも Regular を返す', () => {
    expect(toPlexStyle(null)).toEqual({ fontFamily: FONT.regular, fontWeight: undefined })
    expect(toPlexStyle(undefined)).toEqual({ fontFamily: FONT.regular, fontWeight: undefined })
  })

  it('明示的な fontFamily 指定がある場合は上書きしない（等幅などの意図を尊重）', () => {
    const s = { fontFamily: 'monospace', fontWeight: '700' as const }
    expect(toPlexStyle(s)).toEqual(s)
  })
})
