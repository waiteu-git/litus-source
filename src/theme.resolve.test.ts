import { describe, it, expect } from 'vitest'
import { resolveVariant } from './theme.resolve'

describe('resolveVariant', () => {
  it('green/white/darkはそのまま解決', () => {
    expect(resolveVariant('green', 'light')).toBe('green')
    expect(resolveVariant('white', 'dark')).toBe('white')
    expect(resolveVariant('dark', 'light')).toBe('dark')
  })
  it('systemはOSダーク時のみdark、それ以外はwhite', () => {
    expect(resolveVariant('system', 'dark')).toBe('dark')
    expect(resolveVariant('system', 'light')).toBe('white')
    expect(resolveVariant('system', null)).toBe('white')
    expect(resolveVariant('system', undefined)).toBe('white')
  })
})
