import { describe, expect, it } from 'vitest'
import { deserializeOnboardingDone, serializeOnboardingDone } from './onboardingSerialize'

describe('onboardingSerialize', () => {
  it('true を往復できる', () => {
    expect(deserializeOnboardingDone(serializeOnboardingDone(true))).toBe(true)
  })
  it('null（未保存）は false', () => {
    expect(deserializeOnboardingDone(null)).toBe(false)
  })
  it('壊れたJSONは false', () => {
    expect(deserializeOnboardingDone('{oops')).toBe(false)
  })
  it('boolean以外は false', () => {
    expect(deserializeOnboardingDone('"yes"')).toBe(false)
  })
})
