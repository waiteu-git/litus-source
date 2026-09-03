import type { AttendanceSession } from '../parsers/attendanceStats'
import { mondayOf, weekMondayKey, type WeeklyPattern } from '../timetableEvents/weeklyPattern'

/**
 * 出欠データ（学生出欠状況確認）の各回日付（"MM/DD"）から、実施パターン(weeklyPattern)による
 * 隔週の非実施週除外を導くための純粋ロジック。出欠ページは当該学期の全授業日程分の日付を持つため
 * （将来の予定日まで日付入り・実採取で確認）、授業日程PDFや学期境界のハードコード無しに
 * この科目の全学期週を起こせる。年は日付列（時系列）と現在日時から解決する。
 */

/** 年解決済みの回。date は元の 'MM/DD'（excludeDates 照合キー）、full は実日付。 */
export type ResolvedSession = { date: string; full: Date }

const MMDD = /^(\d{1,2})\/(\d{1,2})$/

const MS_PER_DAY = 24 * 60 * 60 * 1000

// 基準年決定の許容量（§2.3、docs/design/2026-09-03-attendance-year-inference.md）。
// 候補年は必ず{nowY-1, nowY, nowY+1}の3つなので、基準年決定は1年周期で必ず1回「反転」する
// （原理的に消せない・実測で確定済み）。反転位置は「学期開始のTOLERANCE_DAYS日前」に来るため、
// 値はその反転を無害な日へ動かすように選ぶ。総当たり実測:
//   0日  → 反転が学期初日ちょうど（学期開始直前のテストケースが落ちる）
//   14日 → 反転が春休み(3/27)・夏休み(8/28)＝授業の無い期間に落ちる（採用）
//   60日 → 反転が後期の試験期に落ちる＝選んではいけない
const TOLERANCE_DAYS = 14

/**
 * 各回（時系列順・空/非MM/DDは除外）を実日付へ解決する。
 * 基準年: 先頭回の MM/DD を候補年 {now-1, now, now+1} に置き、
 * 先頭回が now+TOLERANCE_DAYS 以内になる最大の年を採る（過去へ倒す。
 * 学期開始前の収集ぶんだけ未来を許す。後期の年跨ぎも吸収）。
 * 以降は月が前回より小さくなったら年+1（12月→1月の折返し）。
 */
export function resolveTermDates(sessions: AttendanceSession[], now: Date): ResolvedSession[] {
  const dated: { date: string; m: number; d: number }[] = []
  for (const s of sessions) {
    const mt = s.date ? s.date.match(MMDD) : null
    if (mt) dated.push({ date: s.date as string, m: Number(mt[1]), d: Number(mt[2]) })
  }
  if (dated.length === 0) return []

  const first = dated[0]
  const nowY = now.getFullYear()
  // 候補{nowY-1, nowY, nowY+1}のうち、先頭回が now+TOLERANCE_DAYS 以内になる最大の年を採る。
  // nowY-1 の先頭回は必ず過去になるため常に条件を満たし、規則は全域で定義される。
  const limit = now.getTime() + TOLERANCE_DAYS * MS_PER_DAY
  let baseYear = nowY - 1
  for (const y of [nowY - 1, nowY, nowY + 1]) {
    if (new Date(y, first.m - 1, first.d).getTime() <= limit) baseYear = y
  }

  const out: ResolvedSession[] = []
  let year = baseYear
  let prevM = first.m
  for (const s of dated) {
    if (s.m < prevM) year += 1 // 月が戻った＝年跨ぎ（12→1）
    prevM = s.m
    out.push({ date: s.date, full: new Date(year, s.m - 1, s.d) })
  }
  return out
}

/** 解決済み日付から、この科目の全学期週（月曜Date・昇順ユニーク）を起こす。 */
export function termWeeksFromSessions(resolved: ResolvedSession[]): Date[] {
  const seen = new Set<string>()
  const out: Date[] = []
  for (const r of resolved) {
    const key = weekMondayKey(r.full)
    if (!seen.has(key)) {
      seen.add(key)
      out.push(mondayOf(r.full))
    }
  }
  out.sort((a, b) => a.getTime() - b.getTime())
  return out
}

/** 休み週(pattern.off)に入る回の日付('MM/DD')一覧（ユニーク）＝computeAttendanceRisk の excludeDates。 */
export function deriveExcludedDates(pattern: WeeklyPattern, resolved: ResolvedSession[]): string[] {
  const off = pattern.off
  if (!off) return []
  const out = new Set<string>()
  for (const r of resolved) {
    if (off[weekMondayKey(r.full)]) out.add(r.date)
  }
  return [...out]
}
