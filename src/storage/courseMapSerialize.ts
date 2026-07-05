import type { CourseCodeMap } from '../parsers/letusCourses'

export function serializeCourseMap(map: CourseCodeMap): string {
  return JSON.stringify(map)
}

/** null/壊れJSON/配列/非オブジェクトは {}。name:string, url:string, codes:string[] を満たすエントリのみ採用。 */
export function deserializeCourseMap(raw: string | null): CourseCodeMap {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  const out: CourseCodeMap = {}
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== 'object' || v === null) continue
    const e = v as { name?: unknown; url?: unknown; codes?: unknown }
    if (typeof e.name !== 'string' || typeof e.url !== 'string') continue
    if (!Array.isArray(e.codes) || !e.codes.every((c) => typeof c === 'string')) continue
    out[k] = { name: e.name, url: e.url, codes: e.codes as string[] }
  }
  return out
}
