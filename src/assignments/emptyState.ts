// 課題一覧の空状態3類型の判定（純粋関数）。「取得失敗かゼロか不明」を排除する。
// done=全部提出済み(祝福)／unsynced=未同期(行動CTA)／error=取得失敗(説明)／null=一覧を表示。
import type { AssignmentFilter } from './assignmentListItems'

export type AssignmentsEmpty = 'done' | 'unsynced' | 'error' | null

export function assignmentsEmptyState(input: {
  liveCount: number
  notSubmittedCount: number
  submittedCount: number
  refreshedAt: number
  healthOk: boolean
  filter: AssignmentFilter
}): AssignmentsEmpty {
  const { liveCount, notSubmittedCount, submittedCount, refreshedAt, healthOk, filter } = input
  if (liveCount === 0) {
    // 一度も同期していない → 行動を促す。同期済みで取得失敗（キャッシュも空）→ 説明。
    if (refreshedAt === 0) return 'unsynced'
    if (!healthOk) return 'error'
    return 'unsynced'
  }
  // 課題はあるが未提出ゼロ＝やることは片付いた（提出済みはフィルタで見られる）。
  if (filter === 'not_submitted' && notSubmittedCount === 0 && submittedCount > 0) return 'done'
  return null
}
