import { describe, it, expect } from 'vitest'
import { badgeCountLabel } from './badgeLabel'

describe('badgeCountLabel', () => {
  it('countがあればラベルに数を付す、なければラベルのみ', () => {
    expect(badgeCountLabel('未読', 3)).toBe('未読 3')
    expect(badgeCountLabel('新着', 0)).toBe('新着 0')
    expect(badgeCountLabel('未読')).toBe('未読')
  })
})
