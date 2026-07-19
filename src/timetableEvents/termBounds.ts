// 週送りの学期内クランプ範囲と第N週の学期起点を、出欠日程の実日付集合から導く純粋ロジック（RN非依存）。
// 出欠データが無い（学期序盤等）ときは近未来フォールバック（過去2週〜先16週）。offsetは defaultWeekMonday(now) 基準。
import { mondayOf } from './weekDates'
import { currentWeekOffset, weekDiff, defaultWeekMonday } from './weekNav'

export type TermBounds = { termStartMonday: Date | null; min: number; max: number }

export function deriveTermBounds(termDates: Date[], now: Date): TermBounds {
  const cwo = currentWeekOffset(now)
  if (termDates.length === 0) {
    return { termStartMonday: null, min: cwo - 2, max: cwo + 16 }
  }
  const anchor = defaultWeekMonday(now)
  let startMonday = mondayOf(termDates[0])
  let endMonday = startMonday
  for (const d of termDates) {
    const m = mondayOf(d)
    if (m.getTime() < startMonday.getTime()) startMonday = m
    if (m.getTime() > endMonday.getTime()) endMonday = m
  }
  const minOff = weekDiff(startMonday, anchor)
  const maxOff = weekDiff(endMonday, anchor)
  // 現在週は必ず到達可能に（clampが今週を弾かない）。
  return { termStartMonday: startMonday, min: Math.min(minOff, cwo), max: Math.max(maxOff, cwo) }
}
