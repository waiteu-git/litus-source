/**
 * ストア単位の直列書き込みキュー（純粋・RN非依存）。
 * AsyncStorageのread-modify-writeが並走するとlost update（後勝ち上書き）になるため、
 * 同一ストアへの書き込み系タスクをFIFOで1本ずつ実行する（単一ライタ）。
 * serializeRuns（合流あり）と違い、投入された全タスクを必ず順番に実行する。
 */
export function createWriteQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve()
  return <T>(task: () => Promise<T>): Promise<T> => {
    const p = tail.then(() => task())
    // キュー自体は失敗を飲み込んで進む（失敗はそのタスクの呼び出し元pへ伝播し、後続は必ず実行される）。
    tail = p.catch(() => undefined)
    return p
  }
}
