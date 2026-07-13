/**
 * spatial モーション（動き・ジェスチャ）用の spring トークン。React Native 非依存＝vitest可能。
 *
 * M3 standard spatial は減衰比 ζ≈0.9 のバネ。RN Animated.spring の `damping` は減衰比でなく
 * 減衰係数なので c=2ζ√(k·m) で変換する（androidxの dampingRatio を直写しすると発振する）。
 * 採用値は 67/50/33（base/slowは厳密ζ=0.9の48/31よりやや強めのζ≈0.94/0.95）。
 */

/** 減衰比ζ→減衰係数c。c = 2ζ√(k·m)。 */
export function dampingFromRatio(stiffness: number, zeta = 0.9, mass = 1): number {
  return 2 * zeta * Math.sqrt(stiffness * mass)
}

/** 減衰係数c→減衰比ζ。ζ = c / (2√(k·m))。採用値の検算用。 */
export function zetaOf(stiffness: number, damping: number, mass = 1): number {
  return damping / (2 * Math.sqrt(stiffness * mass))
}

type Spring = { stiffness: number; damping: number; mass: number }

/** 3速の spatial spring。Animated.spring({ stiffness, damping, mass, useNativeDriver:true }) に渡す。 */
export const SPRING_SPATIAL: { fast: Spring; base: Spring; slow: Spring } = {
  fast: { stiffness: 1400, damping: 67, mass: 1 },
  base: { stiffness: 700, damping: 50, mass: 1 },
  slow: { stiffness: 300, damping: 33, mass: 1 },
}

/** PanResponder gestureState.vx(px/ms) を Animated.spring velocity(px/s) 相当へ。 */
export function pxPerMsToPxPerSec(vx: number): number {
  return vx * 1000
}
