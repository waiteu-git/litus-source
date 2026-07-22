/**
 * 「学期の授業回が終わった科目に、出席案内を出し続けない」ための純粋ロジック。
 *
 * findActiveClass は時間割テンプレの曜日・時刻だけで判定するため日付を持たず、
 * 学期が終わっていても毎週その時間帯になれば必ず該当を返していた。ここで科目ごとの
 * 「最終授業日」と「追加の予定（期末・追試・補講・教室変更など）」を起こし、述語として注入する。
 *
 * 判定は徹底して fail-open（迷ったら出す）。案内を余分に出す害より、
 * 出席できるはずの回で案内が消える害のほうが大きい。
 */
import type { AttendanceCourseStats } from '../parsers/attendanceStats'
import type { BulletinEventCandidate } from '../timetableEvents/bulletinEvents'
import { makeupOccurrences, type ClassEvent } from '../timetableEvents/classEvent'
import { dateToYmd } from '../timetableEvents/eventDateValue'
import { resolveTermDates } from './attendanceTerm'

/** 学期の通常回が終わった後もその日その科目に授業がある、と分かっている予定。 */
export type ExtraPlan = { courseCode: string | null; courseName: string; date: string }

/**
 * 出欠各回（'MM/DD'）から科目ごとの最終授業日（'YYYY-MM-DD'）を起こす。
 * 鍵は科目コードと科目名の両方（呼び出し側はコード優先で引く）。
 *
 * 日付のある回が1回以下の科目は鍵を作らない。出欠が取れていない/パースが退化した科目を
 * 「今日が最終回」と誤判定して案内を消してしまうのを避けるため（fail-open）。
 */
export function courseTermEnds(courses: AttendanceCourseStats[], now: Date): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of courses) {
    const resolved = resolveTermDates(c.sessions, now)
    if (resolved.length < 2) continue
    let last = resolved[0].full
    for (const r of resolved) if (r.full.getTime() > last.getTime()) last = r.full
    const end = dateToYmd(last)
    if (c.courseCode) out[c.courseCode] = end
    if (c.courseName) out[c.courseName] = end
  }
  return out
}

/** 登録済みイベントから追加の予定を平坦化する。休講(cancel)自体は予定ではないので含めない。 */
export function extraPlansFromEvents(events: ClassEvent[]): ExtraPlan[] {
  const out: ExtraPlan[] = []
  for (const e of events) {
    // makeup は makeupOccurrences 側で拾う（休講内包の補講と同じ経路にまとめる）。
    if (e.type === 'cancel' || e.type === 'makeup') continue
    out.push({ courseCode: e.courseCode, courseName: e.courseName, date: e.date })
  }
  const byId = new Map(events.map((e) => [e.id, e]))
  for (const m of makeupOccurrences(events)) {
    out.push({ courseCode: byId.get(m.sourceId)?.courseCode ?? null, courseName: m.courseName, date: m.date })
  }
  return out
}

/** 掲示由来の候補から追加の予定を平坦化する（補講と休講内包補講のみ。掲示から期末・追試は起こせない）。 */
export function extraPlansFromCandidates(cands: BulletinEventCandidate[]): ExtraPlan[] {
  const out: ExtraPlan[] = []
  for (const c of cands) {
    if (c.type === 'makeup') out.push({ courseCode: c.courseCode, courseName: c.courseName, date: c.date })
    if (c.makeup) out.push({ courseCode: c.courseCode, courseName: c.courseName, date: c.makeup.date })
  }
  return out
}

/**
 * その日その科目の出席案内をまだ出すか。
 * 最終授業日が分からなければ出す／最終授業日までは出す／過ぎていても同日に追加の予定があれば出す。
 */
export function isCourseActiveOn(a: {
  courseCode: string
  courseName: string
  dateKey: string
  termEnds: Record<string, string>
  extraPlans: ExtraPlan[]
}): boolean {
  const end = (a.courseCode ? a.termEnds[a.courseCode] : undefined) ?? a.termEnds[a.courseName]
  if (!end) return true
  if (a.dateKey <= end) return true
  return a.extraPlans.some(
    (p) => p.date === a.dateKey && (p.courseCode ? p.courseCode === a.courseCode : p.courseName === a.courseName),
  )
}
