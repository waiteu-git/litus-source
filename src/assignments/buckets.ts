/**
 * 課題一覧の締切帯セクション分け（純粋関数）。
 * 設計: docs/2026-07-06-assignments-tab-design.md 3.6/4。ignored は既定で全バケットから除外。
 * 判定優先: 提出済み → 開始前 → 期限切れ → 24h以内 → 明日 → 今週 → それ以降。
 * バケット内は締切昇順（締切なしは末尾）。
 */
import type { Assignment } from '../storage/assignmentsSerialize'

export type BucketKey =
  | 'within24h'
  | 'tomorrow'
  | 'thisWeek'
  | 'later'
  | 'beforeStart'
  | 'submitted'
  | 'overdue'

/** 表示順（UIはこの順でセクションを描画し、空バケットは省く）。 */
export const BUCKET_ORDER: BucketKey[] = [
  'within24h',
  'tomorrow',
  'thisWeek',
  'later',
  'beforeStart',
  'overdue',
  'submitted',
]

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

function isSameLocalDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function classify(assignment: Assignment, now: Date): BucketKey {
  if (assignment.submissionStatus === 'submitted' || assignment.submissionStatus === 'completed') {
    return 'submitted'
  }
  if (assignment.lifecycleStatus === 'submitted') return 'submitted'
  if (assignment.lifecycleStatus === 'before_start') return 'beforeStart'

  if (assignment.deadline === null) return 'later'
  const deadlineMs = new Date(assignment.deadline).getTime()
  if (Number.isNaN(deadlineMs)) return 'later'

  const nowMs = now.getTime()
  if (deadlineMs < nowMs) return 'overdue'
  if (deadlineMs <= nowMs + DAY_MS) return 'within24h'

  const tomorrow = new Date(nowMs + DAY_MS)
  if (isSameLocalDate(new Date(deadlineMs), tomorrow)) return 'tomorrow'
  if (deadlineMs <= nowMs + 7 * DAY_MS) return 'thisWeek'
  return 'later'
}

function byDeadlineAsc(a: Assignment, b: Assignment): number {
  if (a.deadline === null && b.deadline === null) return a.title.localeCompare(b.title, 'ja')
  if (a.deadline === null) return 1
  if (b.deadline === null) return -1
  const diff = new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
  return diff !== 0 ? diff : a.title.localeCompare(b.title, 'ja')
}

export function bucketAssignments(
  assignments: Assignment[],
  now: Date,
): Record<BucketKey, Assignment[]> {
  const out: Record<BucketKey, Assignment[]> = {
    within24h: [],
    tomorrow: [],
    thisWeek: [],
    later: [],
    beforeStart: [],
    overdue: [],
    submitted: [],
  }
  for (const assignment of assignments) {
    if (assignment.ignored) continue
    out[classify(assignment, now)].push(assignment)
  }
  for (const key of BUCKET_ORDER) out[key].sort(byDeadlineAsc)
  return out
}
