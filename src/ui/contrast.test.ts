import { describe, it, expect } from 'vitest'
import { contrastRatio, flatten } from './contrast'
import { resolveUiColors } from '../theme.tokens'
import { COLORS } from '../theme.palette'

describe('contrastRatio', () => {
  it('黒白は21:1、同色は1:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 2)
  })
})

describe('意味色ロールの可読性（白/読書面で4.5:1）', () => {
  const light = resolveUiColors('white')
  it('意味色テキストは各Bg上で本文4.5:1以上', () => {
    expect(contrastRatio(light.danger, light.dangerBg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(light.warn, light.warnBg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(light.info, light.infoBg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(light.success, light.successBg)).toBeGreaterThanOrEqual(4.5)
  })
  it('本文ink×surfaceは十分高い', () => {
    expect(contrastRatio(COLORS.ink, '#ffffff')).toBeGreaterThanOrEqual(7)
  })
  it('warn引き上げ(#9a5b00)は白地4.5:1を満たす(旧#b26a00は割れる)', () => {
    expect(contrastRatio('#9a5b00', '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })
})

describe('翠グラデ上のガラス面（最暗点で合成し3:1）', () => {
  it('inkOnGlass はガラス最暗点上でUI 3:1以上', () => {
    const glassAtDarkest = flatten('rgba(255,255,255,0.36)', COLORS.gradBottom)
    expect(contrastRatio(COLORS.inkOnGlass, glassAtDarkest)).toBeGreaterThanOrEqual(3)
  })
})
