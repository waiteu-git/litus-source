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

  it('RNの名前付きウェイトも数値へ正規化して写像する', () => {
    expect(fontFamilyForWeight('regular')).toBe(FONT.regular)
    expect(fontFamilyForWeight('light')).toBe(FONT.regular)
    expect(fontFamilyForWeight('medium')).toBe(FONT.medium)
    expect(fontFamilyForWeight('semibold')).toBe(FONT.bold)
    expect(fontFamilyForWeight('heavy')).toBe(FONT.bold)
    expect(fontFamilyForWeight('black')).toBe(FONT.bold)
  })

  it('未知の文字列は Regular にフォールバックする', () => {
    expect(fontFamilyForWeight('nonsense')).toBe(FONT.regular)
  })
})

describe('toPlexStyle', () => {
  it('flatten済みstyleに fontFamily を付与し fontWeight キーを取り除く', () => {
    const out = toPlexStyle({ fontSize: 14, fontWeight: '600', color: '#000' })
    expect(out).toEqual({ fontSize: 14, color: '#000', fontFamily: FONT.bold })
    expect('fontWeight' in out).toBe(false)
  })

  it('fontWeight が無い style は Regular を付与する', () => {
    expect(toPlexStyle({ fontSize: 12 })).toEqual({ fontSize: 12, fontFamily: FONT.regular })
  })

  it('style 未指定（null/undefined）でも Regular を返す', () => {
    expect(toPlexStyle(null)).toEqual({ fontFamily: FONT.regular })
    expect(toPlexStyle(undefined)).toEqual({ fontFamily: FONT.regular })
  })

  it('明示的な fontFamily 指定はその family を尊重し、fontWeight は必ず落とす', () => {
    const out = toPlexStyle({ fontFamily: 'monospace', fontWeight: '700' as const })
    expect(out).toEqual({ fontFamily: 'monospace' })
    expect('fontWeight' in out).toBe(false)
  })
})
