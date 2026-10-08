import { describe, expect, it } from 'vitest'
import { COLORS, DARK } from './theme.palette'
import { celebrationColors, type CelebrationVariant } from './theme.celebration'
import { resolveUiColors } from './theme.tokens'

/** WCAG 2.x の相対輝度とコントラスト比（#rrggbb のみ）。 */
function lum(hex: string): number {
  const n = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
function ratio(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
/** 2色の中間（t=0..1）。翠グラデの途中の色を代表させる。 */
function mix(a: string, b: string, t: number): string {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)
  const c = [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t))
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
}

/** 半透明の白（alpha）を背景 bg に重ねた色。翠のガラスカード（rgba(255,255,255,0.36)）の見かけの地を求める。 */
function overWhite(bg: string, alpha: number): string {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)
  const c = [0, 1, 2].map((i) => Math.round(255 * alpha + p(bg, i) * (1 - alpha)))
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
}

/**
 * カードの見かけの地（標準のガラスカード）。翠は半透明なので、ホームの上部（カードが載る位置＝グラデの上から約25%）の
 * 背景に重ねた色で測る。白・ダークは不透明。トークン（resolveUiColors）から取るので、カードの地が変わればここも追随する。
 */
function cardBackdrop(v: CelebrationVariant): string {
  const card = resolveUiColors(v).cardBg
  if (v === 'green') {
    const m = card.match(/rgba\(255,255,255,([0-9.]+)\)/)!
    return overWhite(mix(COLORS.gradTop, COLORS.gradBottom, 0.25), Number(m[1]))
  }
  return card
}

const VARIANTS: CelebrationVariant[] = ['green', 'white', 'dark']
const HEX = /^#[0-9a-f]{6}$/i

describe('celebrationColors: 全バリアントで、本文が読める（4.5:1 以上）', () => {
  it.each(VARIANTS)('%s: すべて #rrggbb（トークン経由で使えるよう値を一箇所に集める）', (v) => {
    for (const val of Object.values(celebrationColors(v))) expect(val).toMatch(HEX)
  })

  it('起動画面の2行: 白は白地、ダークは暗地、翠は上端付近のグラデ色の上で 4.5:1 以上', () => {
    const bgs: Record<CelebrationVariant, string> = {
      white: '#ffffff',
      dark: DARK.bg,
      // 文字は画面の上端近く（グラデ全体の約12%）。端の明るい側で測る＝いちばん厳しい側。
      green: mix(COLORS.gradTop, COLORS.gradBottom, 0.12),
    }
    for (const v of VARIANTS) {
      const c = celebrationColors(v)
      expect(ratio(c.bootTitle, bgs[v])).toBeGreaterThanOrEqual(4.5)
      expect(ratio(c.bootName, bgs[v])).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(VARIANTS)('%s: カードの絵（フラスコと星）の線と面が、実際のカード地（標準のガラスカード）の上で見える（非文字は 3:1 以上）', (v) => {
    const c = celebrationColors(v)
    const bg = cardBackdrop(v)
    expect(ratio(c.markOutline, bg)).toBeGreaterThanOrEqual(3)
    expect(ratio(c.markLiquid, bg)).toBeGreaterThanOrEqual(3)
    expect(ratio(c.markStarStroke, bg)).toBeGreaterThanOrEqual(3)
  })

  it('カードの地を台帳で上書きしない（淡い黄みの面にしない＝警告面 warnBg と見分けがつく）: 台帳に cardBg・ink・link・note が無い', () => {
    for (const v of VARIANTS) {
      const keys = Object.keys(celebrationColors(v))
      for (const k of ['cardBg', 'ink', 'link', 'note']) expect(keys).not.toContain(k)
    }
  })

  it('見出しの下の細い線は、地の上で見える濃さ（白地で象牙が消えない）', () => {
    expect(ratio(celebrationColors('white').headerLine, '#ffffff')).toBeGreaterThanOrEqual(1.8)
    expect(ratio(celebrationColors('dark').headerLine, DARK.bg)).toBeGreaterThanOrEqual(3)
    expect(ratio(celebrationColors('green').headerLine, mix(COLORS.gradTop, COLORS.gradBottom, 0.1))).toBeGreaterThanOrEqual(1.6)
  })

  it('新しい意味色を作らない: 琥珀系の警告色（warn）と同じ値を使わない（色が付いている＝異常、の規約）', () => {
    const forbidden = new Set(['#b26a00', '#ffb95e', '#ffb84d', '#f2b93a', '#f0b840'])
    for (const v of VARIANTS) {
      for (const val of Object.values(celebrationColors(v))) expect(forbidden.has(val.toLowerCase())).toBe(false)
    }
  })
})
