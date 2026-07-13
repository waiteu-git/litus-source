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
