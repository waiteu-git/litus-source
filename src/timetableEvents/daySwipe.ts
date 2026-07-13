// 時間割リスト表示の左右スワイプによる曜日移動の決定ロジック（純粋関数）。
// days は表示中の曜日集合（土日の有無で長さが変わる）。端はクランプ＝移動なしで null を返す。
// ループさせないのは、土日非表示時に月⇔金が隣接ジャンプになり方向感覚を裏切るため。
export type SwipeDirection = 'next' | 'prev'

export function swipeTargetDay<D extends string>(
  days: readonly D[],
  current: D,
  direction: SwipeDirection,
): D | null {
  const i = days.indexOf(current)
  if (i < 0) return null
  const j = direction === 'next' ? i + 1 : i - 1
  if (j < 0 || j >= days.length) return null
  return days[j]
}
