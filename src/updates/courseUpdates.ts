/**
 * LETUS course page update detection via activity link set changes.
 * Signature = activity links, Diff = URL set difference from previous snapshot.
 */
import { extractLinksFromHtml, type CourseLink } from '../parsers/letusLinks'

const MOD_VIEW = /\/mod\/[^/]+\/view\.php/

export function computeCourseSignature(html: string, baseUrl: string): CourseLink[] {
  const links = extractLinksFromHtml(html, baseUrl)
  const seen = new Set<string>()
  const activities: CourseLink[] = []
  for (const l of links) {
    if (!MOD_VIEW.test(l.url)) continue
    if (seen.has(l.url)) continue
    seen.add(l.url)
    activities.push(l)
  }
  activities.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))
  return activities
}

export function diffCourseSignature(
  prev: CourseLink[],
  next: CourseLink[],
): { added: CourseLink[]; removed: CourseLink[] } {
  const prevUrls = new Set(prev.map((a) => a.url))
  const nextUrls = new Set(next.map((a) => a.url))
  return {
    added: next.filter((a) => !prevUrls.has(a.url)),
    removed: prev.filter((a) => !nextUrls.has(a.url)),
  }
}
