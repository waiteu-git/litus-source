/**
 * コースアクティビティリンクから課題候補URLを絞り込む純粋関数。
 * 設計: docs/2026-07-06-assignments-tab-design.md 3.2。既存の `isAssignmentLikeLink`（standard）を
 * 土台に、課題/小テスト/Turnitin/相互評価などの view.php のみ残し、URLで重複排除する。
 */
import { isAssignmentLikeLink, type CourseLink } from '../parsers/letusLinks'

export function filterAssignmentCandidates(links: CourseLink[]): CourseLink[] {
  const seen = new Set<string>()
  const result: CourseLink[] = []
  for (const link of links) {
    if (!isAssignmentLikeLink(link.title, link.url, 'standard')) continue
    if (seen.has(link.url)) continue
    seen.add(link.url)
    result.push(link)
  }
  return result
}
