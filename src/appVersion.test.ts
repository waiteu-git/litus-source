import { describe, expect, it } from 'vitest'
import { formatBuildTag, formatVersionLabel } from './appVersion'

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

describe('formatBuildTag', () => {
  it('versionCode から vNN 形式のタグを作る', () => {
    expect(formatBuildTag(76)).toBe('v76')
    expect(formatBuildTag('76')).toBe('v76')
  })

  it('前後空白は除去する', () => {
    expect(formatBuildTag(' 76 ')).toBe('v76')
  })

  it('build 欠落時（Expo Go 等）は dev にフォールバック', () => {
    expect(formatBuildTag(null)).toBe('dev')
    expect(formatBuildTag(undefined)).toBe('dev')
    expect(formatBuildTag('')).toBe('dev')
    expect(formatBuildTag('   ')).toBe('dev')
  })
})
