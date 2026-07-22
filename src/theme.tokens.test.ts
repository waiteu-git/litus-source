import { describe, it, expect } from 'vitest'
import { resolveUiColors, statusBarStyleFor } from './theme.tokens'
import { contrastRatio } from './ui/contrast'
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

describe('resolveUiColors 意味色ロール（新設）', () => {
  it('green は白地上で読める意味色＋白系priorityBorderを返す', () => {
    const t = resolveUiColors('green')
    expect(t.danger).toBe('#b3261e')
    expect(t.dangerBg).toBe('#fdecea')
    expect(t.warn).toBe('#9a5b00')
    expect(t.warnBg).toBe('#fdf3e1')
    expect(t.info).toBe('#1c5fb2')
    expect(t.infoBg).toBe('#e8f1fb')
    expect(t.success).toBe('#0b6b2f')
    expect(t.successBg).toBe('#e6f4ea')
    expect(t.priorityBorder).toBe('rgba(255,255,255,0.72)')
  })

  it('white はlightと同じ意味色＋緑系priorityBorderを返す', () => {
    const t = resolveUiColors('white')
    expect(t.danger).toBe('#b3261e')
    expect(t.info).toBe('#1c5fb2')
    expect(t.priorityBorder).toBe('#a3d4bf')
  })

  it('dark は脱飽和した意味色＋夜の翠priorityBorderを返す', () => {
    const t = resolveUiColors('dark')
    expect(t.danger).toBe('#ff8f85')
    expect(t.dangerBg).toBe('rgba(255,143,133,0.14)')
    expect(t.warn).toBe('#ffb95e')
    expect(t.info).toBe('#7db3ff')
    expect(t.success).toBe('#6fd598')
    expect(t.priorityBorder).toBe('rgba(55,201,155,0.45)')
  })
})

describe('resolveUiColors ドメイン色（時間割グリッド/実施パターン/マーカー）', () => {
  it('green/white は現状値を踏襲し見た目を保つ', () => {
    const g = resolveUiColors('green')
    expect(g.gridCellNowBg).toBe('rgba(255,255,255,0.88)')
    expect(g.gridCellPersonalBg).toBe('rgba(46,160,120,0.10)')
    expect(g.gridCellText).toBe('#04322a')
    expect(g.patternOffText).toBe('#a33417')
    expect(g.favorite).toBe('#f5a623')
    const w = resolveUiColors('white')
    expect(w.gridCellFilledBg).toBe('#e8f4ee')
    expect(w.gridCellText).toBe(COLORS.ink)
    expect(w.flagAccent).toBe('#e0a100')
    expect(w.updateDot).toBe('#e8a400')
  })

  it('dark は暗地で視認できる専用値を返す', () => {
    const t = resolveUiColors('dark')
    expect(t.gridCellNowBg).toBe(DARK.gridNow)
    expect(t.gridCellPersonalBg).toBe(DARK.gridPersonal)
    expect(t.gridCellText).toBe(DARK.value)
    expect(t.patternOffBg).toBe(DARK.patternOffBg)
    expect(t.favorite).toBe('#ffb84d')
    expect(t.flagAccent).toBe(DARK.flag)
  })
})

describe('resolveUiColors 読書面ロール（skin非依存の不透明サーフェス）', () => {
  it('翠/白skinは同じ明色の読書面（白地・ink文字・#e3ece8境界）を返す', () => {
    for (const v of ['green', 'white'] as const) {
      const t = resolveUiColors(v)
      expect(t.readingSurface).toBe(COLORS.white)
      expect(t.readingInk).toBe(COLORS.ink)
      expect(t.readingBorder).toBe('#e3ece8')
      expect(t.readingHeading).toBe(COLORS.emeraldDark)
    }
  })
  it('dark は暗い読書面（DARK.card地・明文字）を返す', () => {
    const t = resolveUiColors('dark')
    expect(t.readingSurface).toBe(DARK.card)
    expect(t.readingInk).toBe(DARK.value)
    expect(t.readingBorder).toBe(DARK.divider)
  })
})

describe('statusBarStyleFor', () => {
  it('翠/白は暗アイコン、darkのみ明アイコンを返す', () => {
    expect(statusBarStyleFor('white')).toBe('dark')
    expect(statusBarStyleFor('green')).toBe('dark')
    expect(statusBarStyleFor('dark')).toBe('light')
  })

  it('引数は variant のみ＝OSカラースキームを混ぜる余地がない', () => {
    // expo-status-bar の 'auto' は useColorScheme（OSの外観）だけで解決されアプリのテーマを見ない。
    // 引数が1つであること自体が「OS依存に戻していない」ことの構造的な保証になる。
    expect(statusBarStyleFor.length).toBe(1)
  })

  it('全 variant でバーアイコンと画面上端色のコントラストが 3:1 以上（WCAG 非テキスト下限）', () => {
    for (const v of ['green', 'white', 'dark'] as const) {
      const t = resolveUiColors(v)
      const bg = t.gradient ? t.gradient[0] : t.screenSolid
      const fg = statusBarStyleFor(v) === 'light' ? '#ffffff' : '#000000'
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(3)
    }
  })

  it('修正前の破綻値を記録：白テーマ地に白アイコンは 1.00（完全不可視）', () => {
    // OSダーク × アプリ「白」で 'auto' が light-content を選んでいた時の実値。
    expect(contrastRatio('#ffffff', resolveUiColors('white').screenSolid)).toBeCloseTo(1, 5)
  })
})
