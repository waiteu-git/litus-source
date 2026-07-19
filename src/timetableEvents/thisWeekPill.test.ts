import { describe, it, expect } from 'vitest'
import { shouldShowThisWeekChip } from './thisWeekPill'

describe('shouldShowThisWeekChip', () => {
  it('既定週（offset===currentOffset）は非表示', () => {
    expect(shouldShowThisWeekChip({ weekOffset: 0, currentOffset: 0 })).toBe(false)
    expect(shouldShowThisWeekChip({ weekOffset: -1, currentOffset: -1 })).toBe(false)
  })
  it('別週なら表示', () => {
    expect(shouldShowThisWeekChip({ weekOffset: 1, currentOffset: 0 })).toBe(true)
    expect(shouldShowThisWeekChip({ weekOffset: 0, currentOffset: -1 })).toBe(true)
  })
})
