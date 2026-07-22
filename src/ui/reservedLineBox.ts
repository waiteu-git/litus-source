/**
 * 自動送りカルーセル内の行数可変テキストに常時確保する高さ(dp)。
 *
 * lineHeight は fontScale で伸びる（Android: TextAttributes.effectiveLineHeight が
 * PixelUtil.toPixelFromSP 経由で scaledDensity を掛ける／iOS: RCTTextAttributes が
 * lineHeight * effectiveFontSizeMultiplier を使う）のに対し、View/Text の minHeight は
 * dp のまま伸びない。よって固定値を置くと大きい文字設定でだけ確保不足＝高さジッタが戻る。
 * ここで fontScale を掛けて追随させる。
 *
 * itemCount<=1 は自動送りが起きず高さも変わらないので確保しない（無駄な余白を作らない）。
 */
export function reservedLineBoxHeight(o: {
  lineHeight: number
  lines: number
  fontScale: number
  itemCount: number
}): number | undefined {
  if (o.itemCount <= 1 || o.lines <= 1) return undefined
  const scale = Number.isFinite(o.fontScale) && o.fontScale > 0 ? o.fontScale : 1
  return o.lineHeight * o.lines * scale
}
