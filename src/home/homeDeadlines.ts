/**
 * ホームの「直近の締切」用の純関数（Things3「This Evening」型の時間帯バンド分け）。
 * 端末非依存・now注入で決定論的（vitestで検証可能）。締切超過は home の直近には出さない（アクション可能なもののみ）。
 * 提出済みも直近内なら締め括り表示のため含める（UI側で success チップ）。
 */
import type { Assignment } from '../storage/assignmentsSerialize'
import { isSubmitted, byDeadlineAsc } from '../assignments/deadline'

export type HomeDeadlineBand = 'evening' | 'tonight' | 'thisWeek' | 'later'
export type HomeDeadlineItem = { a: Assignment; done: boolean }
export type HomeDeadlineGroup = { band: HomeDeadlineBand; items: HomeDeadlineItem[] }

const DAY_MS = 24 * 3600 * 1000
const BAND_ORDER: HomeDeadlineBand[] = ['evening', 'tonight', 'thisWeek', 'later']

/** 締切のバンド。超過(now未満)・不正は null（＝直近に出さない）。 */
export function homeDeadlineBand(iso: string, now: Date): HomeDeadlineBand | null {
  const d = new Date(iso)
  const t = d.getTime()
  if (Number.isNaN(t) || t < now.getTime()) return null
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  if (sameDay) {
    return d.getHours() * 60 + d.getMinutes() <= 18 * 60 ? 'evening' : 'tonight'
  }
  if (t <= now.getTime() + 7 * DAY_MS) return 'thisWeek'
  return 'later'
}

/** 直近の締切（未提出＋直近の提出済み）を締切昇順で最大 limit 件、バンド順にまとめて返す。 */
export function homeDeadlines(assignments: Assignment[], now: Date, limit = 5): HomeDeadlineGroup[] {
  const cand = assignments
    .filter(
      (a) =>
        !a.ignored &&
        a.lifecycleStatus !== 'before_start' && // まだ提出できない（開始前）は直近に出さない
        a.deadline !== null &&
        !Number.isNaN(new Date(a.deadline).getTime()) &&
        new Date(a.deadline).getTime() >= now.getTime(),
    )
    .sort(byDeadlineAsc)
    .slice(0, limit)
  const groups = new Map<HomeDeadlineBand, HomeDeadlineItem[]>()
  for (const a of cand) {
    const band = homeDeadlineBand(a.deadline as string, now)
    if (!band) continue
    if (!groups.has(band)) groups.set(band, [])
    groups.get(band)!.push({ a, done: isSubmitted(a) })
  }
  return BAND_ORDER.filter((b) => groups.has(b)).map((band) => ({ band, items: groups.get(band)! }))
}
