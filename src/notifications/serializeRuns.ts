/**
 * 非同期処理の直列化ラッパ（純粋・RN非依存）。
 * 実行中に呼ばれたら完了を待ってから1回だけ追走し、実行中に重なった要求はその1回に合流する。
 */
export function serializeRuns<A extends unknown[]>(
  run: (...args: A) => Promise<void>,
): (...args: A) => Promise<void> {
  let current: Promise<void> | null = null
  let queued: Promise<void> | null = null

  const start = (...args: A): Promise<void> => {
    const p = run(...args).finally(() => {
      if (current === p) current = null
    })
    current = p
    return p
  }

  return (...args: A) => {
    // 追走が予約済みなら合流（前走完了〜追走開始のマイクロタスク隙間でも新規実行しない）。
    if (queued) return queued
    if (!current) return start(...args)
    // 実行中: 完了を待ってから1回だけ追走する（失敗していても追走はする）。
    queued = current.catch(() => undefined).then(() => {
      queued = null
      return start(...args)
    })
    return queued
  }
}
