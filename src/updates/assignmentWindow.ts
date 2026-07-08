/**
 * 課題収集の訪問対象を絞る純粋関数（スマホ版の負荷軽減）。
 *
 * 締切は課題ページを訪問しないと分からないため、初回は全候補を訪問するしかない。だが2回目
 * 以降は前回の締切が保存済みなので、**±windowDays の窓に入る課題（＋締切不明・＋新規）だけ**を
 * 再訪問すればよい。遠い未来/十分過去の課題は毎回訪問しない（保存済みの内容をそのまま表示）。
 * これで毎回の同期が大幅に速くなる。窓外の課題は時が来れば窓に入って再訪問される。
 */
import type { AssignmentMap } from '../storage/assignmentsSerialize'

const DAY_MS = 24 * 60 * 60 * 1000

export interface VisitCandidate {
  url: string
}

export function selectAssignmentsToVisit<T extends VisitCandidate>(
  candidates: T[],
  stored: AssignmentMap,
  now: Date = new Date(),
  windowDays = 14,
): T[] {
  const nowMs = now.getTime()
  const windowMs = windowDays * DAY_MS
  return candidates.filter((c) => {
    const prev = stored[c.url]
    if (!prev) return true // 新規は締切を知るため必ず訪問
    if (!prev.deadline) return true // 締切不明は再確認
    const d = new Date(prev.deadline).getTime()
    if (Number.isNaN(d)) return true // 壊れた締切は再確認
    return Math.abs(d - nowMs) <= windowMs // ±windowDays の窓内のみ再訪問
  })
}
