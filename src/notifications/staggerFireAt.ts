/**
 * 同一時刻に固まった通知の発火時刻を決定論的にずらす純粋関数。
 *
 * 実コードで同一 fireAt（ミリ秒一致）が出る経路が3つある:
 *  1. 各回イベント（休講/補講/教室変更/小テスト）は当日分が全て 8:00 固定・前夜分が 20:00 固定。
 *  2. 締切が同じ課題の deadline-24h/3h/1h は完全に同じ時刻になる（LETUS は 23:59 締切が並ぶ）。
 *  3. 同一曜限に積まれた別科目の出席開始アラームは時限開始ちょうどで一致する。
 *     courseCode が違うため notificationPlan の重複排除には掛からない。
 *
 * expo-notifications の NotificationContentInput に Android の group/groupKey が無いため
 * OS のグループ＋サマリーによる集約が使えない。件数は減らせないので、発火を数十秒ずつ
 * ずらしてヘッドアップと音の重なりだけを解く（実機報告「一気に2つきてうるさい」への対処）。
 *
 * 予約枠の優先度配分（planNotifications）は**元の時刻**で行うべきなので、必ずその後に適用する。
 */

/** 既定のずらし幅。大きくすると「授業開始ちょうど」の意味が薄れるので数十秒に留める。 */
export const DEFAULT_STAGGER_STEP_MS = 20_000

/**
 * fireAt が完全一致するグループを keyOf の昇順で並べ、i 番目に i*stepMs を加算した新配列を返す。
 * 単独時刻の要素は不変。入力（配列・要素）は破壊しない。出力の並びは入力順を保つ。
 * fireAt が日付として解釈できない要素は触らない。
 */
export function staggerSameInstant<T extends { fireAt: string }>(
  items: readonly T[],
  stepMs: number,
  keyOf: (item: T) => string,
): T[] {
  const groups = new Map<number, T[]>()
  for (const item of items) {
    const ms = new Date(item.fireAt).getTime()
    if (Number.isNaN(ms)) continue
    const g = groups.get(ms)
    if (g) g.push(item)
    else groups.set(ms, [item])
  }

  const shiftByItem = new Map<T, number>()
  for (const [ms, group] of groups) {
    if (group.length < 2) continue
    // 同一時刻内の順序は keyOf の昇順で決める（入力順に依存すると実行ごとに時刻が揺れ、
    // 貼り直しのたびに通知時刻が変わってしまう）。
    const ordered = [...group].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0))
    ordered.forEach((item, i) => {
      if (i > 0) shiftByItem.set(item, ms + i * stepMs)
    })
  }

  return items.map((item) => {
    const shifted = shiftByItem.get(item)
    return shifted === undefined ? item : { ...item, fireAt: new Date(shifted).toISOString() }
  })
}
