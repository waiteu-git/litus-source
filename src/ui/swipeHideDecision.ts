/**
 * スワイプ非表示のしきい値と判定（純粋・端末非依存＝vitestで検証可能）。
 * PanResponder の gestureState から「横スワイプ捕捉」「非表示確定」を決める。
 * 時間割の曜日スワイプ（daySwipe）と同じく、縦スクロールと分離する横優勢判定を採る。
 */
/**
 * 捕捉しきい値。**SwipeToHide は capture 段で responder を決める**（SwipeToHide.tsx 参照）ので、
 * 通常段のときより述語を厳しくしないと FlatList の縦スクロールを取りすぎる。
 * 値は同じ問題（横スワイプ×縦スクロールコンテナ）を先に解いた TimetableScreen の実績値と揃える
 * （24px / 比1.6）。あちらは縦ScrollView＋pull-to-refresh と共存しており、iOS/Android 双方に
 * 出荷済み＝両OSで成立することが実機で確かめられている唯一の組み合わせなので、OS で分けない。
 */
export const SWIPE_CAPTURE_DX = 24
export const SWIPE_CAPTURE_RATIO = 1.6
export const SWIPE_COMMIT_DX = 96
export const SWIPE_COMMIT_VX = 0.35

/** 横スワイプとして捕捉するか（|dx|が十分＋縦優勢でない＝FlatListの縦スクロールを妨げない）。 */
export function shouldCaptureSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) > SWIPE_CAPTURE_DX && Math.abs(dx) > SWIPE_CAPTURE_RATIO * Math.abs(dy)
}

/** 離した時に非表示を確定するか。左へ十分引いた or 速い左フリック（vx=px/ms）。 */
export function shouldCommitHide(dx: number, vx: number): boolean {
  return dx <= -SWIPE_COMMIT_DX || (dx < 0 && vx <= -SWIPE_COMMIT_VX)
}

/** 表示中の左移動量。右方向は0で固定、過剰な左は行幅で抑制する。 */
export function clampSwipeX(dx: number, width: number): number {
  if (dx > 0) return 0
  const min = -(width > 0 ? width : 9999)
  return dx < min ? min : dx
}
