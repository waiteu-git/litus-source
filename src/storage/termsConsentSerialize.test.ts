import { describe, expect, it } from 'vitest'
import { deserializeTermsConsent, serializeTermsConsent } from './termsConsentSerialize'

describe('termsConsentSerialize', () => {
  it('round-trips a version number', () => {
    expect(deserializeTermsConsent(serializeTermsConsent(1))).toBe(1)
    expect(deserializeTermsConsent(serializeTermsConsent(5))).toBe(5)
  })
  it('treats null as 0 (未同意)', () => {
    expect(deserializeTermsConsent(null)).toBe(0)
  })
  it('treats broken JSON as 0', () => {
    expect(deserializeTermsConsent('{not json')).toBe(0)
  })
  it('treats non-number as 0', () => {
    expect(deserializeTermsConsent(JSON.stringify('x'))).toBe(0)
    expect(deserializeTermsConsent(JSON.stringify(true))).toBe(0)
    expect(deserializeTermsConsent(JSON.stringify(null))).toBe(0)
  })
})
