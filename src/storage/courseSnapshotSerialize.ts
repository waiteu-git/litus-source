import type { CourseLink } from '../parsers/letusLinks'

export type CourseSnapshot = {
  activities: CourseLink[]
  collectedAt: string
  added: CourseLink[]
  removed: CourseLink[]
}
export type CourseSnapshotMap = Record<string, CourseSnapshot>

export function serializeCourseSnapshots(m: CourseSnapshotMap): string {
  return JSON.stringify(m)
}

function isLinkArray(v: unknown): v is CourseLink[] {
  return (
    Array.isArray(v) &&
    v.every((x) => typeof x === 'object' && x !== null && typeof (x as CourseLink).title === 'string' && typeof (x as CourseLink).url === 'string')
  )
}

/** null/壊れJSON/配列/不正エントリは {}。activities/added/removed が CourseLink[]、collectedAt が string のみ採用。 */
export function deserializeCourseSnapshots(raw: string | null): CourseSnapshotMap {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  const out: CourseSnapshotMap = {}
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== 'object' || v === null) continue
    const e = v as Partial<CourseSnapshot>
    if (!isLinkArray(e.activities) || !isLinkArray(e.added) || !isLinkArray(e.removed)) continue
    if (typeof e.collectedAt !== 'string') continue
    out[k] = { activities: e.activities, collectedAt: e.collectedAt, added: e.added, removed: e.removed }
  }
  return out
}
