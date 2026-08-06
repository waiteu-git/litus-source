// 週送りの学期内クランプ範囲と第N週の学期起点を、出欠日程の実日付集合から導く純粋ロジック（RN非依存）。
// 出欠データが無い（学期序盤・入れ直し直後等）ときは学年暦（月ベース近似）の授業期間でクランプし、
// 授業期間外（長期休み）は直近に終わった学期へ戻る方向だけ許す。
// offsetは defaultWeekMonday(now) 基準。
import { mondayOf } from './weekDates'
import { currentWeekOffset, weekDiff, defaultWeekMonday } from './weekNav'

export type TermBounds = { termStartMonday: Date | null; min: number; max: number }

/** 授業期間（開始日と最終日。最終日はその日いっぱいを含む）。 */
export type AcademicTermRange = { start: Date; lastDay: Date }

// CLASSは学期の日付範囲をどこにも公開しないため、出欠の実日付が無いときは学年暦の月ベース近似で代用する
// （defaultCurrentQuarter / academicYear と同じ流儀）。
//   前期: 4/1 〜 8/7
//   後期: 9/1 〜 翌2/7（endは翌年）
//
// 🔴開始と終了で「どちらへ倒すか」が逆。同じ向きに揃えてはいけない。
//
//   【開始】早い側へ倒す。実暦へ寄せて遅らせてはいけない。
//     実暦は年度ごとに数日〜2週動く（例: 2026年度の後期授業開始は9/11）。開始を実暦に合わせると、
//     ドリフトした年に実際の授業日が授業期間外へ落ちる。落ちた週は min=max=現在週＝前後どちらの
//     矢印も効かない＝機能停止として見える（`FALL.startDay=16` の時、2026年度の後期第1週が
//     丸ごとこれに当たっていた）。開始が早すぎても、授業前の週へ数週よけいに送れるだけで済む。
//
//   【終了】遅い側へ倒してはいけない。ここで遅すぎるのは「授業も試験もない週へ送れる」＝
//     この機能がそもそも直そうとした不具合そのもの。2026-08-06に実際に踏んだ＝開始を広げた時に
//     終了も一緒に 8/7→8/15 へ広げてしまい、ユーザーから「期末が終わった後もスクロールできる」と
//     再報告された。大学の夏期一斉休暇 8/12〜8/22（一次資料で確認）とも矛盾していた。
//
// ⚠終了日は「その日を含む週」まで到達可能にする＝日付を数日足すと週ごと1つ増えることがある。
//   8/7 と 8/15 は4日違いだが、週で見ると 8/3 の週と 8/10 の週で1週分違う。終了側に余裕を持たせない。
//
// この近似が効くのは「出欠データが無い」時だけ。授業が始まれば出欠ページに当該学期の全日程
// （将来の予定日込み）が入り、実日付側の導出へ切り替わる。
const SPRING = { startMonth: 4, startDay: 1, endMonth: 8, endDay: 7 }
const FALL = { startMonth: 9, startDay: 1, endMonth: 2, endDay: 7 } // endは翌年

/** now の年から見た学期候補。年跨ぎの後期は「当年開始」「前年開始」の両方を見る（1〜2月は前年度の後期）。 */
function termCandidates(now: Date): AcademicTermRange[] {
  const y = now.getFullYear()
  return [
    { start: new Date(y, SPRING.startMonth - 1, SPRING.startDay), lastDay: new Date(y, SPRING.endMonth - 1, SPRING.endDay) },
    { start: new Date(y, FALL.startMonth - 1, FALL.startDay), lastDay: new Date(y + 1, FALL.endMonth - 1, FALL.endDay) },
    { start: new Date(y - 1, FALL.startMonth - 1, FALL.startDay), lastDay: new Date(y, FALL.endMonth - 1, FALL.endDay) },
  ]
}

/** lastDay はその日いっぱいを含む＝翌日0:00が終端（時刻付きの now を弾かない）。 */
function endExclusive(r: AcademicTermRange): Date {
  return new Date(r.lastDay.getFullYear(), r.lastDay.getMonth(), r.lastDay.getDate() + 1)
}

/** now が属する授業期間。授業期間外（夏休み/春休み）は null。 */
export function academicTermRange(now: Date): AcademicTermRange | null {
  const t = now.getTime()
  for (const c of termCandidates(now)) {
    if (t >= c.start.getTime() && t < endExclusive(c).getTime()) return c
  }
  return null
}

/**
 * now の時点で「直近に終わっている」学期。授業期間外のときに過去week側の下限として使う。
 * 授業期間内で呼ぶと1つ前の学期を返す（現在の学期はまだ終わっていない）＝期間外のときだけ使うこと。
 */
export function lastEndedTermRange(now: Date): AcademicTermRange | null {
  const t = now.getTime()
  let best: AcademicTermRange | null = null
  for (const c of termCandidates(now)) {
    if (endExclusive(c).getTime() > t) continue // まだ終わっていない
    if (!best || c.lastDay.getTime() > best.lastDay.getTime()) best = c
  }
  return best
}

export function deriveTermBounds(termDates: Date[], now: Date): TermBounds {
  const cwo = currentWeekOffset(now)
  const anchor = defaultWeekMonday(now)
  if (termDates.length === 0) {
    // 学期起点は近似日付なので termStartMonday は null のまま＝「第N週」は出さない。
    const term = academicTermRange(now)
    if (term) {
      return {
        termStartMonday: null,
        min: Math.min(weekDiff(term.start, anchor), cwo),
        max: Math.max(weekDiff(term.lastDay, anchor), cwo),
      }
    }
    // 授業期間外（8/16〜8/31 / 2/16〜3/31）は直近に終わった学期を後ろ方向にだけ許す。
    // 前へ送っても授業日は無いので上限は現在週。min=max=現在週にすると両方の矢印が死んで
    // 「週送りが壊れた」と見えるため、振り返りの方向だけは残す。
    const last = lastEndedTermRange(now)
    if (!last) return { termStartMonday: null, min: cwo, max: cwo }
    return { termStartMonday: null, min: Math.min(weekDiff(last.start, anchor), cwo), max: cwo }
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
