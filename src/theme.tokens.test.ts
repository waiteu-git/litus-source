import { describe, it, expect } from 'vitest'
import { resolveUiColors } from './theme.tokens'
import { COLORS, DARK } from './theme.palette'

describe('resolveUiColors', () => {
  it('white は従来の白テーマ値を返す（回帰防止）', () => {
    const t = resolveUiColors('white')
    expect(t.gradient).toBeNull()
    expect(t.cardBg).toBe(COLORS.white)
    expect(t.valueColor).toBe(COLORS.ink)
    expect(t.accent).toBe(COLORS.emerald)
    expect(t.pillBg).toBe('#d6efe4')
  })

  it('green は従来のグラス値を返す（回帰防止）', () => {
    const t = resolveUiColors('green')
    expect(t.gradient).toEqual([COLORS.gradTop, COLORS.gradBottom])
    expect(t.heading).toBe(COLORS.white)
    expect(t.accent).toBe('#ffffff')
    expect(t.pillText).toBe('#04322a')
  })

  it('dark は暗地＋明るい翠アクセントを返す', () => {
    const t = resolveUiColors('dark')
    expect(t.gradient).toEqual([DARK.gradTop, DARK.gradBottom])
    expect(t.cardBg).toBe(DARK.card)
    expect(t.valueColor).toBe(DARK.value)
    expect(t.accent).toBe(COLORS.emeraldLight)
    expect(t.pillText).toBe(COLORS.emeraldLight)
    expect(t.segOnText).toBe(COLORS.white)
  })

  it('前景と地色は各variantで別物（暗地に暗文字などの破綻がない）', () => {
    for (const v of ['green', 'white', 'dark'] as const) {
      const t = resolveUiColors(v)
      expect(t.valueColor).not.toBe(t.cardBg)
    }
  })
})
