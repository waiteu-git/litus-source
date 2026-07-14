// 時間割リスト表示の「今日へ戻る」ピルの表示可否（純粋関数・React Native非依存）。
// リスト表示で「今日」が表示中の曜日集合に含まれ、かつ今見ているのが今日以外のときだけ true。
// - グリッド表示は全曜日を一度に見せ今日列を強調するため対象外（常に false）。
// - 今日が days に無い（例: 土日で個人予定が無く土日が非表示）ときは戻る先が無いので false。
export function shouldShowTodayPill<D extends string>(args: {
  view: 'list' | 'grid'
  selDay: D
  todayKey: D
  days: readonly D[]
}): boolean {
  const { view, selDay, todayKey, days } = args
  if (view !== 'list') return false
  if (!days.includes(todayKey)) return false
  return selDay !== todayKey
}
