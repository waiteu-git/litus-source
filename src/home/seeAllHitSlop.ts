/**
 * ホームの掲示カード「すべて見る」のヒット領域（見た目は変えない＝E0 H2）。React Native 非依存。
 * 上はカルーセルのドット行（marginTop 10＋高さ6＝16）の中まで、下はカードの下余白12まで＝カード（背景を持つ親）の
 * 外へ広げない（RN 0.86 は祖先の境界の外のタッチを子へ渡さない＝E0 禁止事項2）。
 * 未読1件の時はドット行が描かれない（Carousel は2枚以上の時だけ描く）ので、上へ広げるとスライドの差出人の行への
 * タップを奪う＝上は0（2026-09-04 の裁定＝本文を取るのは利用者が開いた掲示だけ、に食い込まない）。
 */
export const SEE_ALL_SLOP_TOP_WITH_DOTS = 14
export const SEE_ALL_SLOP_BOTTOM = 12

export function seeAllHitSlop(unreadCount: number): { top: number; bottom: number } {
  return { top: unreadCount > 1 ? SEE_ALL_SLOP_TOP_WITH_DOTS : 0, bottom: SEE_ALL_SLOP_BOTTOM }
}
