import { Easing } from 'react-native'

/**
 * アプリ共通のモーショントークン（litus モーション試作 ①〜④ で確定）。
 * 画面内アニメは原則ここの duration / easing / displacement を使い、統一感を最優先にする。
 * すべて transform（translate / scale）と opacity で表現し、`useNativeDriver: true` に載せる
 * （高さアニメだけはネイティブ非対応のためアコーディオンで別途 LayoutAnimation を使う）。
 */

/** 継続時間（ms）。micro=マイクロ操作 / fast=フェード / base=標準 / slow=大きめの移動。 */
export const DUR = { micro: 120, fast: 180, base: 240, slow: 360 } as const

/** イージング。enter=入って止まる / exit=出ていく / move=画面内移動。CSS の cubic-bezier と一致。 */
export const EASE = {
  enter: Easing.bezier(0.215, 0.61, 0.355, 1), // out-cubic
  exit: Easing.bezier(0.55, 0.055, 0.675, 0.19), // in-cubic
  move: Easing.bezier(0.645, 0.045, 0.355, 1), // inout-cubic
} as const

/** 変位量（px）。small/medium/large の3段で揃える。 */
export const SHIFT = { small: 8, medium: 16, large: 24 } as const

/** ヒーローの控えめなバネ。overshoot は scale 1.03 まで（過剰バウンス禁止）。 */
export const SPRING = { from: 0.9, over: 1.03, to: 1, upMs: 240, downMs: 150 } as const
