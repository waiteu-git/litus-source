/** 追跡中LETUSコースURL配列の直列化（純粋・RN非依存）。壊れ値は空配列に倒す。 */
export function serializeTrackedCourses(urls: string[]): string {
  return JSON.stringify(urls)
}

export function deserializeTrackedCourses(raw: string | null): string[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter((v): v is string => typeof v === 'string')
}
