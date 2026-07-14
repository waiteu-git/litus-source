/**
 * LETUS全コースリスト（my/courses.php パース結果そのまま・コード無しコース含む）の直列化。
 * courseMap はコードをキーにするためコード無しコースを保持できない——追跡候補の提示にはこちらを使う。
 * 壊れ値は []。name/url/codes を満たすエントリのみ採用。
 */
import type { LetusCourse } from '../parsers/letusCourses'

export function serializeAllCourses(courses: LetusCourse[]): string {
  return JSON.stringify(courses)
}

export function deserializeAllCourses(raw: string | null): LetusCourse[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const out: LetusCourse[] = []
  for (const v of parsed) {
    if (typeof v !== 'object' || v === null) continue
    const e = v as { name?: unknown; url?: unknown; codes?: unknown }
    if (typeof e.name !== 'string' || typeof e.url !== 'string') continue
    if (!Array.isArray(e.codes) || !e.codes.every((x) => typeof x === 'string')) continue
    out.push({ name: e.name, url: e.url, codes: e.codes as string[] })
  }
  return out
}
