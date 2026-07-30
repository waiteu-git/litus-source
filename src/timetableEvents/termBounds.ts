// 週送りの学期内クランプ範囲と第N週の学期起点を、出欠日程の実日付集合から導く純粋ロジック（RN非依存）。
// 出欠データが無い（学期序盤・入れ直し直後等）ときは学年暦（月ベース近似）の授業期間でクランプする。
// offsetは defaultWeekMonday(now) 基準。
import { mondayOf } from './weekDates'
import { currentWeekOffset, weekDiff, defaultWeekMonday } from './weekNav'

export type TermBounds = { termStartMonday: Date | null; min: number; max: number }

/** 授業期間（開始日と最終日。最終日はその日いっぱいを含む）。 */
export type AcademicTermRange = { start: Date; lastDay: Date }

// CLASSは学期の日付範囲をどこにも公開しないため、出欠の実日付が無いときは学年暦の月ベース近似で代用する
// （defaultCurrentQuarter / academicYear と同じ流儀）。定期試験ぶんを月初側に持たせている。
//   前期: 4/1 〜 8/7（7月末に授業終了＋8月上旬の定期試験）
//   後期: 9/16 〜 翌2/7（9月下旬開始＋1月末に授業終了＋2月上旬の定期試験）
// 残る 8/8〜9/15（夏休み）と 2/8〜3/31（春休み）は授業期間外。
// 境界は年度ごとに数日動くが、授業が始まれば出欠ページに当該学期の全日程（将来の予定日込み）が入り
// 実日付側の導出へ切り替わるため、この近似が効くのは各学期の入口の短い期間だけ。
const SPRING = { startMonth: 4, startDay: 1, endMonth: 8, endDay: 7 }
const FALL = { startMonth: 9, startDay: 16, endMonth: 2, endDay: 7 } // endは翌年

/**
 * now が属する授業期間。授業期間外（夏休み/春休み）は null。
 * 年跨ぎの後期は「当年開始」「前年開始」の両方を候補に見る（1〜2月は前年度の後期）。
 */
export function academicTermRange(now: Date): AcademicTermRange | null {
  const y = now.getFullYear()
  const candidates: AcademicTermRange[] = [
    { start: new Date(y, SPRING.startMonth - 1, SPRING.startDay), lastDay: new Date(y, SPRING.endMonth - 1, SPRING.endDay) },
    { start: new Date(y, FALL.startMonth - 1, FALL.startDay), lastDay: new Date(y + 1, FALL.endMonth - 1, FALL.endDay) },
    { start: new Date(y - 1, FALL.startMonth - 1, FALL.startDay), lastDay: new Date(y, FALL.endMonth - 1, FALL.endDay) },
  ]
  const t = now.getTime()
  for (const c of candidates) {
    // lastDay はその日いっぱいを含む＝翌日0:00未満で判定（時刻付きの now を弾かない）。
    const endExclusive = new Date(c.lastDay.getFullYear(), c.lastDay.getMonth(), c.lastDay.getDate() + 1)
    if (t >= c.start.getTime() && t < endExclusive.getTime()) return c
  }
  return null
}

export function deriveTermBounds(termDates: Date[], now: Date): TermBounds {
  const cwo = currentWeekOffset(now)
  const anchor = defaultWeekMonday(now)
  if (termDates.length === 0) {
    const term = academicTermRange(now)
    // 授業期間外は週送りしない（今週のみ）。学期起点は近似日付なので null のまま＝「第N週」は出さない。
    if (!term) return { termStartMonday: null, min: cwo, max: cwo }
    return {
      termStartMonday: null,
      min: Math.min(weekDiff(term.start, anchor), cwo),
      max: Math.max(weekDiff(term.lastDay, anchor), cwo),
    }
  }
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
