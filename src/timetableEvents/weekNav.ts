// 「表示中の週」アンカーの純粋ロジック（React Native非依存・now注入で決定論的・vitest対象）。
// 時間割は日付に紐づかない毎週同じテンプレートだが、この軸で既存の週次ロジックを未来週/過去週へ配線する。
// 既定週の基準は「日曜のみ翌週」（月〜土は今週・日曜は翌週＝週末に翌週を確認できる。ユーザー裁定 2026-07-19）。
import { mondayOf } from './weekDates'

const WEEK_MS = 7 * 86400000

/** 月曜Date同士の週数差（round で夏時間の1時間ずれを吸収）。入力が月曜でなくても mondayOf で寄せる。 */
export function weekDiff(a: Date, b: Date): number {
  return Math.round((mondayOf(a).getTime() - mondayOf(b).getTime()) / WEEK_MS)
}

/** 既定で表示する週の月曜。日曜は翌週の月曜、月〜土は今週の月曜。 */
export function defaultWeekMonday(now: Date): Date {
  const m = mondayOf(now)
  if (now.getDay() === 0) m.setDate(m.getDate() + 7) // 日曜だけ翌週へ送る
  return m
}

/** 表示中の週（offset 週ずらし）の月曜。 */
export function viewedWeekMonday(now: Date, offset: number): Date {
  const m = defaultWeekMonday(now)
  m.setDate(m.getDate() + offset * 7)
  return m
}

/** 「今日を含む週」を指す offset。平日=0、日曜=-1（既定が翌週のため）。「今週へ戻る」の遷移先。 */
export function currentWeekOffset(now: Date): number {
  return weekDiff(mondayOf(now), defaultWeekMonday(now))
}

/** offset を学期内 [min,max] にクランプ。 */
export function clampOffset(offset: number, bounds: { min: number; max: number }): number {
  return Math.max(bounds.min, Math.min(bounds.max, offset))
}

/** 第N週（学期起点の月曜からの週数+1）。termStartMonday が null なら null（ピル非表示）。 */
export function weekOrdinal(viewedMonday: Date, termStartMonday: Date | null): number | null {
  if (!termStartMonday) return null
  return weekDiff(viewedMonday, termStartMonday) + 1
}
