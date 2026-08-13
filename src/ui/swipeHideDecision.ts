/**
 * スワイプ非表示のしきい値と判定（純粋・端末非依存＝vitestで検証可能）。
 * PanResponder の gestureState から「横スワイプ捕捉」「非表示確定」を決める。
 * 時間割の曜日スワイプ（daySwipe）と同じく、縦スクロールと分離する横優勢判定を採る。
 */
/**
 * 捕捉しきい値。**判別は距離でなく比に担わせる。**
 *
 * capture 段で responder を決めても（SwipeToHide.tsx 参照）、**述語が真になるまでの移動は
 * ネイティブのスクロールが食う**。距離で待つ形にすると、待っている間にリストが目に見えて動き、
 * 実機の症状（「左スワイプしようとすると画面が上下に動く」＝縦が勝つ側）がそのまま残る。
 * そこで距離は 8px まで下げて助走を見せず、比 2.5 で「明確に横」だけを拾う
 * （8px 時点で縦成分が 3.2px 未満＝ほぼ真横のときだけ奪う）。
 *
 * ⚠**`TimetableScreen` の週送りは 24px / 比1.6 のままでよい＝値を揃えないこと。**
 * あちらは**ページ単位の操作**なので多少の助走が自然で、実績値で動いている。こちらは
 * **行の即応操作**なので、同じ形だと反応が遅れて縦に負ける。**用途が違うので値が違う**。
 */
export const SWIPE_CAPTURE_DX = 8
export const SWIPE_CAPTURE_RATIO = 2.5

/**
 * 確定しきい値。**捕捉とは別物で、こちらが厳しいと「掴めるのに決まらない」になる。**
 *
 * 実機の症状（2026-08-13）＝「少しスライドすると、スライドし切ることなく戻ってしまうことが多い」。
 * 捕捉を 8px/比2.5 へ緩めて掴めるようにした後に残ったのはこちら側で、旧値 96px は
 * iPhone の画面幅の約1/4を引く必要があり「少し滑らせた」では届かない。速度の代替も
 * 0.35px/ms（350px/秒）とやや速めのフリックを要求していた。
 *
 * **緩めてよい根拠＝非表示は取り消せる。** 隠した課題は「非表示」グループへ入り戻せる
 * （AssignmentsScreen の onToggle('hidden') / 「戻す」）。加えて隠す手段は
 * **スワイプ・長押し・専用ボタンの3つ**あるので、スワイプだけを慎重にしても安全は買えず、
 * 使いにくさだけが残る。**誤爆のコストが低い側なので、届く値へ寄せる。**
 */
export const SWIPE_COMMIT_DX = 56
export const SWIPE_COMMIT_VX = 0.25

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
