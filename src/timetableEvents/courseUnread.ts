import type { BulletinItem } from '../storage/bulletinDigestSerialize'
import { extractCourseCodes } from '../parsers/courseCode'

/**
 * 未読掲示を履修科目コード別に集計する（純粋）。7桁コード完全一致のみ。
 * 1掲示が同一コードを複数含んでも1カウント（Setで畳む）。バッジは「ある/なし」が主目的。
 */
export function courseUnreadCounts(digest: BulletinItem[], timetableCodes: Set<string>): Map<string, number> {
  const out = new Map<string, number>()
  for (const b of digest) {
    if (!b.unread) continue
    for (const code of new Set(extractCourseCodes(b.title))) {
      if (!timetableCodes.has(code)) continue
      out.set(code, (out.get(code) ?? 0) + 1)
    }
  }
  return out
}
