// 「今週へ戻る」ピルの表示可否（純粋関数・React Native非依存）。todayPill の型紙。
// 表示中の週が既定（今日を含む週＝currentOffset）と違うときだけ true。押下で weekOffset を currentOffset へ戻す。
export function shouldShowThisWeekChip(args: { weekOffset: number; currentOffset: number }): boolean {
  return args.weekOffset !== args.currentOffset
}
