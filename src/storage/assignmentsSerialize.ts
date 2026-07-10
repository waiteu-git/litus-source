/**
 * 収集済みLETUS課題の保存表現（自動収集のみ・v1.0.0）。
 * 設計: docs/2026-07-06-assignments-tab-design.md 3.1/3.3。手動追加(source/memo)は v1.0.x へ先送り。
 * keyは課題ページURL。timetableSerialize と同じ検証方針で不正データを安全に落とす。
 */
import type { AssignmentSubmissionStatus, AssignmentLifecycleStatus } from '../parsers/letus'

export type Assignment = {
  url: string
  courseCode: string | null
  courseName: string
  title: string
  deadline: string | null
  deadlineText: string
  submissionStatus: AssignmentSubmissionStatus
  lifecycleStatus: AssignmentLifecycleStatus
  ignored: boolean
  firstSeenAt: string
  lastSeenAt: string
  lastCheckedAt: string
  /** 手動追加した課題（LETUS由来でない）。自動収集はこのキーに触れず、編集・削除ができる。 */
  manual?: boolean
}

export type AssignmentMap = Record<string, Assignment>

const SUBMISSION_STATUSES: readonly string[] = ['unknown', 'not_submitted', 'submitted', 'completed']
const LIFECYCLE_STATUSES: readonly string[] = [
  'active', 'new', 'changed', 'before_start', 'submitted', 'passed', 'missing', 'archived',
]

export function serializeAssignments(map: AssignmentMap): string {
  return JSON.stringify(map)
}

/** null/壊れJSON/配列は {}。全フィールドの型とenum値を満たすエントリのみ採用。 */
export function deserializeAssignments(raw: string | null): AssignmentMap {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  const out: AssignmentMap = {}
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== 'object' || v === null) continue
    const e = v as Partial<Assignment>
    if (typeof e.url !== 'string' || typeof e.title !== 'string') continue
    if (typeof e.courseName !== 'string') continue
    if (e.courseCode !== null && typeof e.courseCode !== 'string') continue
    if (e.deadline !== null && typeof e.deadline !== 'string') continue
    if (typeof e.deadlineText !== 'string') continue
    if (typeof e.submissionStatus !== 'string' || !SUBMISSION_STATUSES.includes(e.submissionStatus)) continue
    if (typeof e.lifecycleStatus !== 'string' || !LIFECYCLE_STATUSES.includes(e.lifecycleStatus)) continue
    if (typeof e.ignored !== 'boolean') continue
    if (typeof e.firstSeenAt !== 'string' || typeof e.lastSeenAt !== 'string' || typeof e.lastCheckedAt !== 'string') continue
    out[k] = {
      url: e.url,
      courseCode: e.courseCode,
      courseName: e.courseName,
      title: e.title,
      deadline: e.deadline,
      deadlineText: e.deadlineText,
      submissionStatus: e.submissionStatus,
      lifecycleStatus: e.lifecycleStatus,
      ignored: e.ignored,
      firstSeenAt: e.firstSeenAt,
      lastSeenAt: e.lastSeenAt,
      lastCheckedAt: e.lastCheckedAt,
    }
    if (e.manual === true) out[k].manual = true
  }
  return out
}
