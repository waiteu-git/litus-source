import { describe, expect, it } from 'vitest'
import { formatVersionLabel } from './appVersion'

describe('formatVersionLabel', () => {
  it('version と build を併記する', () => {
    expect(formatVersionLabel('1.0.0', 75)).toBe('v1.0.0 (build 75)')
    expect(formatVersionLabel('1.0.0', '76')).toBe('v1.0.0 (build 76)')
  })

  it('build 欠落時は version のみ', () => {
    expect(formatVersionLabel('1.2.0', null)).toBe('v1.2.0')
    expect(formatVersionLabel('1.2.0', undefined)).toBe('v1.2.0')
    expect(formatVersionLabel('1.2.0', '')).toBe('v1.2.0')
  })

  it('version 欠落時は 1.0.0 にフォールバック', () => {
    expect(formatVersionLabel(null, 80)).toBe('v1.0.0 (build 80)')
    expect(formatVersionLabel('', 80)).toBe('v1.0.0 (build 80)')
    expect(formatVersionLabel(undefined, undefined)).toBe('v1.0.0')
  })
})
