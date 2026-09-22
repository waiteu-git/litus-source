import { describe, it, expect } from 'vitest'
import {
  reducedShift,
  reducedStagger,
  shouldAnimateAmbient,
  reducedPressScale,
  AMBIENT_STATIC_FRAME,
} from './reducedMotion'

describe('Reduce Motion 純マッピング', () => {
  it('reduce時は変位・staggerを0にする', () => {
    expect(reducedShift(true, 8)).toBe(0)
    expect(reducedShift(false, 8)).toBe(8)
    expect(reducedStagger(true, 40)).toBe(0)
    expect(reducedStagger(false, 40)).toBe(40)
  })
  it('reduce時はambientループを止める', () => {
    expect(shouldAnimateAmbient(true)).toBe(false)
    expect(shouldAnimateAmbient(false)).toBe(true)
  })
  it('reduce時は押下スケールを1にする（opacityは別管理のため対象外）', () => {
    expect(reducedPressScale(true, 0.97)).toBe(1)
    expect(reducedPressScale(false, 0.97)).toBe(0.97)
  })
})

describe('AMBIENT_STATIC_FRAME（E0 M1・M2）', () => {
  it('ループの中間フレーム（0..1 の真ん中＝NowPulse の inputRange [0, 0.5, 1] の真ん中）', () => {
    expect(AMBIENT_STATIC_FRAME).toBe(0.5)
  })
})
