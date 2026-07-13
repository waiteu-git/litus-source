/**
 * WCAG コントラスト計算。React Native 非依存＝vitestでトークンの可読性を固定検証する。
 * 半透明のガラス面は flatten() で不透明地に合成してから比率を取る（下地の変動込みで検証するため）。
 */

function parseHex(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function toHex2(n: number): string {
  return Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')
}

function relLum([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** hex2色のコントラスト比（1〜21）。 */
export function contrastRatio(fg: string, bg: string): number {
  const l1 = relLum(parseHex(fg))
  const l2 = relLum(parseHex(bg))
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

/** `rgba(r,g,b,a)` を不透明な bgHex に重ねた結果のhexを返す（アルファ合成）。 */
export function flatten(fgRgba: string, bgHex: string): string {
  const m = fgRgba.match(/rgba?\(([^)]+)\)/)
  if (!m) return fgRgba
  const parts = m[1].split(',').map((s) => parseFloat(s.trim()))
  const [fr, fg, fb, fa = 1] = parts
  const [br, bg, bb] = parseHex(bgHex)
  const r = fr * fa + br * (1 - fa)
  const g = fg * fa + bg * (1 - fa)
  const b = fb * fa + bb * (1 - fa)
  return '#' + toHex2(r) + toHex2(g) + toHex2(b)
}
