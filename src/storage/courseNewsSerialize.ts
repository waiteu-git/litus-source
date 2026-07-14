/**
 * LETUS新着の累積ストアの直列化（純粋・RN非依存）。壊れ値は空に倒し、
 * 型が不正なコース/活動はエントリ単位で捨てる（他のコースは生かす）。
 */
import type { CourseNewsMap, CourseNewsItem } from '../updates/courseNews'

export function serializeCourseNews(map: CourseNewsMap): string {
  return JSON.stringify(map)
}

export function deserializeCourseNews(raw: string | null): CourseNewsMap {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  const out: CourseNewsMap = {}
  for (const [url, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== 'object' || v === null) continue
    const e = v as { name?: unknown; items?: unknown }
    if (typeof e.name !== 'string' || !Array.isArray(e.items)) continue
    const items = e.items.filter(
      (i): i is CourseNewsItem =>
        typeof i === 'object' &&
        i !== null &&
        typeof (i as CourseNewsItem).title === 'string' &&
        typeof (i as CourseNewsItem).url === 'string' &&
        typeof (i as CourseNewsItem).detectedAt === 'string',
    )
    if (items.length === 0) continue
    out[url] = { name: e.name, items }
  }
  return out
}
