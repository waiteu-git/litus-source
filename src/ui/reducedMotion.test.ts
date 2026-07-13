import { describe, it, expect } from 'vitest'
import { reducedShift, reducedStagger, shouldAnimateAmbient } from './reducedMotion'

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
})
