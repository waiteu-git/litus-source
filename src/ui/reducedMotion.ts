/** reduce時は変位を0に（fade直行）。 */
export function reducedShift(reduce: boolean, shift: number): number {
  return reduce ? 0 : shift
}

/** reduce時はstaggerを0に（同時出現）。 */
export function reducedStagger(reduce: boolean, ms: number): number {
  return reduce ? 0 : ms
}

/** reduce時は長尺の環境ループ（脈動・バー）を止める。 */
export function shouldAnimateAmbient(reduce: boolean): boolean {
  return !reduce
}

/** reduce時は押下スケールを1（無効）に。opacityは動きでなく陰影の状態変化なので別管理で維持する。 */
export function reducedPressScale(reduce: boolean, scale: number): number {
  return reduce ? 1 : scale
}

/**
 * ambient ループを止める時に置く値（ループの中間フレーム・0..1 の真ん中）。毎周期すでに描かれている姿なので、
 * 新しい見た目（色・大きさ・はみ出し）を作らない（E0 §4-1）。NowPulse＝拡大1.28・不透明、IndeterminateBar＝セグメントが中央。
 */
export const AMBIENT_STATIC_FRAME = 0.5
