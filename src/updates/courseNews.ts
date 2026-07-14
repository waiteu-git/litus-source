/**
 * LETUS新着（コースページの活動増分）の累積・既読・剪定ロジック（純粋・RN非依存）。
 * スナップショットの added は「前回巡回比」の揮発値で次の実巡回で消えるため、同期runの差分を
 * ここで累積ストアへ転記し「ユーザーが見るまで残るNEW」を実現する。
 * ライフサイクル: 同期で増分→累積（重複活動URLは追加しない）→ コースを開いたら markCourseSeen で
 * コースごと消える／開かれないまま TTL(14日) 経過で自動失効（pruneCourseNews）。
 * 設計: docs/superpowers/specs/2026-07-14-letus-new-updates-design.md
 */
import type { CourseLink } from '../parsers/letusLinks'

export type CourseNewsItem = { title: string; url: string; detectedAt: string }
export type CourseNewsEntry = { name: string; items: CourseNewsItem[] }
/** key = コースURL。 */
export type CourseNewsMap = Record<string, CourseNewsEntry>

/** 同期runで実巡回したコースの増分（巡回しなかったコースは含めないこと＝保持中の古いaddedの再転記防止）。 */
export type CourseRunDiff = { url: string; name: string; added: CourseLink[] }

/** 通知対象として今回のrunで実際に累積へ追加された活動。 */
export type AppendedNews = { courseUrl: string; courseName: string; title: string; url: string }

/** 見られないまま残った新着の自動失効期間。 */
export const COURSE_NEWS_TTL_MS = 14 * 24 * 60 * 60 * 1000

/**
 * runの差分を累積へ転記する。既に同コースに同じ活動URLがあれば追加しない（冪等）。
 * コース名は最新runの名で更新する（改名追随）。added が空の diff は無視。
 */
export function applyRunDiffs(
  prev: CourseNewsMap,
  diffs: CourseRunDiff[],
  nowIso: string,
): { next: CourseNewsMap; appended: AppendedNews[] } {
  const appended: AppendedNews[] = []
  let next: CourseNewsMap = prev
  let copied = false
  const ensureCopy = () => {
    if (!copied) {
      next = { ...prev }
      copied = true
    }
  }
  for (const d of diffs) {
    if (!d.url || d.added.length === 0) continue
    const cur = next[d.url]
    const known = new Set((cur?.items ?? []).map((i) => i.url))
    const freshLinks = d.added.filter((a) => a.url && !known.has(a.url))
    if (freshLinks.length === 0 && cur && cur.name === d.name) continue
    ensureCopy()
    const items = [
      ...(cur?.items ?? []),
      ...freshLinks.map((a) => ({ title: a.title, url: a.url, detectedAt: nowIso })),
    ]
    next[d.url] = { name: d.name || cur?.name || '', items }
    for (const a of freshLinks) {
      appended.push({ courseUrl: d.url, courseName: d.name, title: a.title, url: a.url })
    }
  }
  return { next, appended }
}

/** コースを開いた＝そのコースの新着をすべて見たとみなし、エントリごと消す。 */
export function markCourseSeen(map: CourseNewsMap, courseUrl: string): CourseNewsMap {
  if (!(courseUrl in map)) return map
  const next = { ...map }
  delete next[courseUrl]
  return next
}

/** TTL超過の活動を落とし、空になったコースを掃除する。変化がなければ同一参照を返す。 */
export function pruneCourseNews(map: CourseNewsMap, nowIso: string): CourseNewsMap {
  const cutoff = new Date(nowIso).getTime() - COURSE_NEWS_TTL_MS
  let changed = false
  const next: CourseNewsMap = {}
  for (const [url, entry] of Object.entries(map)) {
    const kept = entry.items.filter((i) => {
      const t = new Date(i.detectedAt).getTime()
      return Number.isFinite(t) && t >= cutoff
    })
    if (kept.length === 0) {
      changed = true
      continue
    }
    if (kept.length !== entry.items.length) {
      changed = true
      next[url] = { name: entry.name, items: kept }
    } else {
      next[url] = entry
    }
  }
  return changed ? next : map
}

/** コースURL→未読新着件数（ホームカード・NEWバッジ用）。 */
export function unseenCounts(map: CourseNewsMap): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [url, entry] of Object.entries(map)) out[url] = entry.items.length
  return out
}
