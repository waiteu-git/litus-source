/**
 * ホーム「クイックタイル」の行割付（純粋関数・RN非依存）。
 * 横長は常に単独行、半幅は出現順に2個ずつ1行。半幅の総数が奇数なら最後の1個を単独行にする
 * （呼び出し側はその行が1件なら横幅いっぱい、2件なら半幅ずつ、として描画する）。
 * 入力の順序をそのまま優先順として扱う（並べ替えはしない）。
 */
export type TileLayoutItem<T> = { wide: boolean; item: T }
export type TileRow<T> = T[]

export function computeTileRows<T>(items: TileLayoutItem<T>[]): TileRow<T>[] {
  const rows: TileRow<T>[] = []
  let pending: T | undefined
  let hasPending = false

  for (const { wide, item } of items) {
    if (wide) {
      if (hasPending) {
        rows.push([pending as T])
        hasPending = false
      }
      rows.push([item])
    } else if (hasPending) {
      rows.push([pending as T, item])
      hasPending = false
    } else {
      pending = item
      hasPending = true
    }
  }

  if (hasPending) rows.push([pending as T])
  return rows
}
