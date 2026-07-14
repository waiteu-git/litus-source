/**
 * LETUS専用コース追跡（時間割に無く courseMap に載らないコースをユーザーが選んで自動収集対象にする）の
 * 純粋セレクタ（RN非依存）。設計: docs/superpowers/specs/2026-07-15-letus-only-course-tracking-design.md
 */
import type { LetusCourse } from '../parsers/letusCourses'

export type TrackedCourseInfo = { url: string; name: string }

/**
 * 追跡候補＝全コースのうち、パイプライン対象外（courseMap のURLに無い＝コード無し等）かつ未追跡のもの。
 * URL重複は除去し、名前順で返す。
 */
export function selectableCourses(
  all: LetusCourse[],
  courseMapUrls: ReadonlySet<string>,
  tracked: readonly string[],
): TrackedCourseInfo[] {
  const trackedSet = new Set(tracked)
  const seen = new Set<string>()
  const out: TrackedCourseInfo[] = []
  for (const c of all) {
    if (!c.url || seen.has(c.url)) continue
    seen.add(c.url)
    if (courseMapUrls.has(c.url) || trackedSet.has(c.url)) continue
    out.push({ url: c.url, name: c.name })
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  return out
}

/**
 * 追跡中コースの表示情報。名前は allCourses から解決し、見つからないURL（コース一覧の一時取りこぼし）
 * も落とさずURLだけで残す＝追跡状態が同期の空振りで勝手に消えない。
 */
export function trackedCourseInfos(all: LetusCourse[], tracked: readonly string[]): TrackedCourseInfo[] {
  const nameOf = new Map<string, string>()
  for (const c of all) {
    if (c.url && !nameOf.has(c.url)) nameOf.set(c.url, c.name)
  }
  return tracked.map((url) => ({ url, name: nameOf.get(url) ?? '' }))
}

/** 追跡ON/OFFの反転。新配列を返す（元配列は不変）。 */
export function toggleTracked(tracked: readonly string[], url: string): string[] {
  return tracked.includes(url) ? tracked.filter((u) => u !== url) : [...tracked, url]
}
