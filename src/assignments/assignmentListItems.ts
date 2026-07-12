/**
 * 課題一覧をFlatListの data に渡す平坦な ListItem[] へ組み立てる純粋関数。
 * 設計: docs/superpowers/specs/2026-07-13-assignments-list-virtualization-design.md。
 * flat/bucket 両ビュー・フィルタ・折りたたみ・非表示セクションの表示ロジックを一手に担い、
 * 画面（AssignmentsScreen）は描画のみを行う。端末非依存で vitest でテスト可能。
 */
import type { Assignment } from '../storage/assignmentsSerialize'
import type { AssignmentsView } from '../storage/displaySettingsSerialize'
import { bucketAssignments, BUCKET_ORDER, type BucketKey } from './buckets'
import { byDeadlineAsc, isSubmitted } from './deadline'

export type AssignmentFilter = 'not_submitted' | 'submitted' | 'all'

export type ListItem =
  | { type: 'assignment'; key: string; variant: 'flat' | 'card'; a: Assignment; urgent: boolean; done: boolean }
  | { type: 'sectionHeader'; key: string; label: string }
  | { type: 'collapseHeader'; key: string; group: 'overdue' | 'hidden'; label: string; count: number; open: boolean }
  | { type: 'hiddenRow'; key: string; a: Assignment }
  | { type: 'note'; key: string; label: string }

export type BuildAssignmentListInput = {
  assignments: Assignment[]
  now: Date
  filter: AssignmentFilter
  view: AssignmentsView
  showOverdue: boolean
  showHidden: boolean
}

const SECTION_LABEL: Record<BucketKey, string> = {
  within24h: '24時間以内',
  tomorrow: '明日',
  thisWeek: '今週',
  later: 'それ以降',
  beforeStart: '開始前',
  overdue: '期限切れ',
  submitted: '提出済み',
}

const URGENT_BUCKETS: ReadonlySet<BucketKey> = new Set<BucketKey>(['within24h', 'overdue'])

export function buildAssignmentListItems(input: BuildAssignmentListInput): ListItem[] {
  const { assignments, now, filter, view, showOverdue, showHidden } = input
  const live = assignments.filter((a) => !a.ignored)
  const hidden = assignments.filter((a) => a.ignored)
  const items: ListItem[] = []

  if (view === 'flat') {
    const nowMs = now.getTime()
    const isOverdue = (a: Assignment) => a.deadline !== null && new Date(a.deadline).getTime() < nowMs
    const notSub = live.filter((a) => !isSubmitted(a))
    const submitted = [...live.filter(isSubmitted)].sort(byDeadlineAsc)
    const upcoming = [...notSub.filter((a) => !isOverdue(a))].sort(byDeadlineAsc)
    const overdue = [...notSub.filter(isOverdue)].sort(
      (a, b) => new Date(b.deadline as string).getTime() - new Date(a.deadline as string).getTime(),
    )

    let flatMain: Assignment[]
    let flatOverdue: Assignment[]
    if (filter === 'submitted') {
      flatMain = submitted
      flatOverdue = []
    } else if (filter === 'all') {
      flatMain = [...upcoming, ...submitted]
      flatOverdue = overdue
    } else {
      flatMain = upcoming
      flatOverdue = overdue
    }

    if (flatMain.length === 0) {
      items.push({ type: 'note', key: 'note:main', label: '該当する課題はありません' })
    } else {
      for (const a of flatMain) {
        items.push({ type: 'assignment', key: a.url, variant: 'flat', a, urgent: false, done: false })
      }
    }

    if (flatOverdue.length > 0) {
      items.push({
        type: 'collapseHeader',
        key: 'col:overdue',
        group: 'overdue',
        label: `期限切れ ${flatOverdue.length}件`,
        count: flatOverdue.length,
        open: showOverdue,
      })
      if (showOverdue) {
        for (const a of flatOverdue) {
          items.push({ type: 'assignment', key: a.url, variant: 'flat', a, urgent: false, done: false })
        }
      }
    }
  } else {
    const buckets = bucketAssignments(live, now)
    for (const k of BUCKET_ORDER) {
      const list = buckets[k]
      if (list.length === 0) continue
      items.push({ type: 'sectionHeader', key: `sec:${k}`, label: SECTION_LABEL[k] })
      const urgent = URGENT_BUCKETS.has(k)
      const done = k === 'submitted'
      for (const a of list) {
        items.push({ type: 'assignment', key: a.url, variant: 'card', a, urgent, done })
      }
    }
  }

  if (hidden.length > 0) {
    items.push({
      type: 'collapseHeader',
      key: 'col:hidden',
      group: 'hidden',
      label: `非表示 ${hidden.length}件`,
      count: hidden.length,
      open: showHidden,
    })
    if (showHidden) {
      for (const a of hidden) {
        items.push({ type: 'hiddenRow', key: `hid:${a.url}`, a })
      }
    }
  }

  return items
}
