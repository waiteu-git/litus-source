import { describe, it, expect } from 'vitest'
import { tagRoleColors, tagSizeStyle } from './tagRole'
import { resolveUiColors } from '../theme.tokens'

describe('tagRoleColors', () => {
  const c = resolveUiColors('white')
  it('neutralはpill系、意味色roleは各意味色ペアを返す', () => {
    expect(tagRoleColors(c, 'neutral')).toEqual({ bg: c.pillBg, text: c.pillText })
    expect(tagRoleColors(c, 'danger')).toEqual({ bg: c.dangerBg, text: c.danger })
    expect(tagRoleColors(c, 'warn')).toEqual({ bg: c.warnBg, text: c.warn })
    expect(tagRoleColors(c, 'info')).toEqual({ bg: c.infoBg, text: c.info })
    expect(tagRoleColors(c, 'success')).toEqual({ bg: c.successBg, text: c.success })
  })
})

describe('tagSizeStyle', () => {
  it('sm=一覧(8/2,10/700) md=詳細(10/3,12/600)', () => {
    expect(tagSizeStyle('sm')).toEqual({ padH: 8, padV: 2, fontSize: 10, fontWeight: '700' })
    expect(tagSizeStyle('md')).toEqual({ padH: 10, padV: 3, fontSize: 12, fontWeight: '600' })
  })
})
