/**
 * カルーセルの手動スワイプ判定と前後移動の純ロジック。
 * Carousel（screen.tsx）の PanResponder から使う。スライド自体がタップ遷移の
 * Pressable なので、タップと共存できるようスロップ（奪う最小横移動）と
 * スワイプ確定距離を分けて持つ。
 */

/** これ以下の横移動はタップとみなし、子 Pressable にジェスチャを譲る。 */
export const SWIPE_SLOP = 10
/** 指を離した時点でこの距離を横に動いていればスライド切替を確定する。 */
export const SWIPE_DISTANCE = 48

/**
 * 前後移動後のインデックス。両方向に折り返す。
 * items 縮小の瞬間に現在値が範囲外でも配列内に収まる値を返す。
 */
export function stepIndex(current: number, delta: 1 | -1, length: number): number {
  if (length <= 1) return 0
  const cur = Math.min(Math.max(current, 0), length - 1)
  return (cur + delta + length) % length
}

/** 離した時の横移動量から操作を判定する。左スワイプ=次へ、右スワイプ=前へ。 */
export function classifySwipe(dx: number): 'next' | 'prev' | null {
  if (dx <= -SWIPE_DISTANCE) return 'next'
  if (dx >= SWIPE_DISTANCE) return 'prev'
  return null
}

/** 横移動がスロップ超えかつ縦より優勢なときだけレスポンダを奪う（タップ・縦スクロールと共存）。 */
export function shouldCaptureSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) > SWIPE_SLOP && Math.abs(dx) > Math.abs(dy)
}
