import { describe, expect, it } from 'vitest'
import { deserializeBootLogo, serializeBootLogo } from './bootLogoSerialize'

describe('bootLogoSerialize', () => {
  it('green/white を往復できる', () => {
    expect(deserializeBootLogo(serializeBootLogo('green'))).toBe('green')
    expect(deserializeBootLogo(serializeBootLogo('white'))).toBe('white')
  })
  it('null は既定の green', () => {
    expect(deserializeBootLogo(null)).toBe('green')
  })
  it('未知値は green', () => {
    expect(deserializeBootLogo('rainbow')).toBe('green')
  })
})
