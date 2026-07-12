import { describe, expect, it } from 'vitest'
import { buildAssignmentListItems, type BuildAssignmentListInput } from './assignmentListItems'
import type { Assignment } from '../storage/assignmentsSerialize'

const NOW = new Date('2026-07-13T12:00:00+09:00')

function mk(over: Partial<Assignment> & { url: string }): Assignment {
  return {
    url: over.url,
    courseCode: over.courseCode ?? null,
    courseName: over.courseName ?? '科目',
    title: over.title ?? 'タイトル',
    deadline: over.deadline ?? null,
    deadlineText: over.deadlineText ?? '',
    submissionStatus: over.submissionStatus ?? 'not_submitted',
    lifecycleStatus: over.lifecycleStatus ?? 'active',
    ignored: over.ignored ?? false,
    firstSeenAt: over.firstSeenAt ?? NOW.toISOString(),
    lastSeenAt: over.lastSeenAt ?? NOW.toISOString(),
    lastCheckedAt: over.lastCheckedAt ?? NOW.toISOString(),
    ...(over.manual ? { manual: true } : {}),
  }
}

function base(over: Partial<BuildAssignmentListInput>): BuildAssignmentListInput {
  return {
    assignments: [],
    now: NOW,
    filter: 'not_submitted',
    view: 'flat',
    showOverdue: false,
    showHidden: false,
    ...over,
  }
}

const iso = (s: string) => new Date(s).toISOString()

describe('buildAssignmentListItems (flat)', () => {
  it('未提出をflat行として締切昇順で並べ、提出済みは主リストに含めない', () => {
    const items = buildAssignmentListItems(
      base({
        assignments: [
          mk({ url: 'b', deadline: iso('2026-07-15T12:00:00+09:00') }),
          mk({ url: 'a', deadline: iso('2026-07-14T12:00:00+09:00') }),
          mk({ url: 's', submissionStatus: 'submitted', deadline: iso('2026-07-14T12:00:00+09:00') }),
        ],
      }),
    )
    const rows = items.filter((i) => i.type === 'assignment')
    expect(rows.map((r) => (r.type === 'assignment' ? r.a.url : ''))).toEqual(['a', 'b'])
    expect(rows.every((r) => r.type === 'assignment' && r.variant === 'flat')).toBe(true)
  })

  it('期限切れは折りたたみヘッダを出し、閉じているとき配下行を含めない', () => {
    const input = base({
      assignments: [mk({ url: 'o', deadline: iso('2026-07-01T12:00:00+09:00') })],
      showOverdue: false,
    })
    const closed = buildAssignmentListItems(input)
    expect(closed.some((i) => i.type === 'collapseHeader' && i.group === 'overdue')).toBe(true)
    expect(closed.some((i) => i.type === 'assignment')).toBe(false)

    const opened = buildAssignmentListItems({ ...input, showOverdue: true })
    expect(opened.some((i) => i.type === 'assignment')).toBe(true)
  })

  it('主リストが空のときnote項目を出す', () => {
    const items = buildAssignmentListItems(
      base({ assignments: [mk({ url: 'o', deadline: iso('2026-07-01T12:00:00+09:00') })] }),
    )
    expect(items.some((i) => i.type === 'note')).toBe(true)
  })

  it("filter='submitted'は提出済みのみ・期限切れヘッダなし", () => {
    const items = buildAssignmentListItems(
      base({
        filter: 'submitted',
        assignments: [
          mk({ url: 's', submissionStatus: 'submitted' }),
          mk({ url: 'o', deadline: iso('2026-07-01T12:00:00+09:00') }),
        ],
      }),
    )
    const rows = items.filter((i) => i.type === 'assignment')
    expect(rows.map((r) => (r.type === 'assignment' ? r.a.url : ''))).toEqual(['s'])
    expect(items.some((i) => i.type === 'collapseHeader' && i.group === 'overdue')).toBe(false)
  })

  it("filter='all'は未提出(upcoming)＋提出済みを主リストに入れ、期限切れは折りたたみ", () => {
    const items = buildAssignmentListItems(
      base({
        filter: 'all',
        showOverdue: true,
        assignments: [
          mk({ url: 'u', deadline: iso('2026-07-15T12:00:00+09:00') }),
          mk({ url: 's', submissionStatus: 'submitted', deadline: iso('2026-07-14T12:00:00+09:00') }),
          mk({ url: 'o', deadline: iso('2026-07-01T12:00:00+09:00') }),
        ],
      }),
    )
    const mainUrls = items
      .filter((i) => i.type === 'assignment')
      .map((r) => (r.type === 'assignment' ? r.a.url : ''))
    expect(mainUrls).toContain('u')
    expect(mainUrls).toContain('s')
    expect(mainUrls).toContain('o')
    const overdueHeaderIdx = items.findIndex((i) => i.type === 'collapseHeader' && i.group === 'overdue')
    const oIdx = items.findIndex((i) => i.type === 'assignment' && i.a.url === 'o')
    expect(overdueHeaderIdx).toBeGreaterThanOrEqual(0)
    expect(oIdx).toBeGreaterThan(overdueHeaderIdx)
  })
})

describe('buildAssignmentListItems (bucket)', () => {
  it('BUCKET_ORDER順にセクション見出しとcard行を出し、urgent/doneを立てる', () => {
    const items = buildAssignmentListItems(
      base({
        view: 'bucket',
        assignments: [
          mk({ url: 'soon', deadline: iso('2026-07-13T18:00:00+09:00') }),
          mk({ url: 'done', submissionStatus: 'submitted' }),
        ],
      }),
    )
    expect(items.some((i) => i.type === 'sectionHeader')).toBe(true)
    const soon = items.find((i) => i.type === 'assignment' && i.a.url === 'soon')
    expect(soon && soon.type === 'assignment' && soon.variant).toBe('card')
    expect(soon && soon.type === 'assignment' && soon.urgent).toBe(true)
    const done = items.find((i) => i.type === 'assignment' && i.a.url === 'done')
    expect(done && done.type === 'assignment' && done.done).toBe(true)
  })

  it('ignoredはbucketセクションに出さない', () => {
    const items = buildAssignmentListItems(
      base({
        view: 'bucket',
        assignments: [mk({ url: 'hid', ignored: true, deadline: iso('2026-07-13T18:00:00+09:00') })],
      }),
    )
    expect(items.some((i) => i.type === 'assignment')).toBe(false)
  })
})

describe('buildAssignmentListItems (hidden section)', () => {
  it('非表示があれば末尾に折りたたみヘッダを出し、開いたときhiddenRowを出す（flat/bucket共通）', () => {
    for (const view of ['flat', 'bucket'] as const) {
      const input = base({
        view,
        assignments: [mk({ url: 'h', ignored: true })],
        showHidden: false,
      })
      const closed = buildAssignmentListItems(input)
      expect(closed.some((i) => i.type === 'collapseHeader' && i.group === 'hidden')).toBe(true)
      expect(closed.some((i) => i.type === 'hiddenRow')).toBe(false)

      const opened = buildAssignmentListItems({ ...input, showHidden: true })
      expect(opened.some((i) => i.type === 'hiddenRow')).toBe(true)
    }
  })

  it('全itemのkeyは一意', () => {
    const items = buildAssignmentListItems(
      base({
        filter: 'all',
        showOverdue: true,
        showHidden: true,
        assignments: [
          mk({ url: 'u', deadline: iso('2026-07-15T12:00:00+09:00') }),
          mk({ url: 'o', deadline: iso('2026-07-01T12:00:00+09:00') }),
          mk({ url: 'h', ignored: true }),
        ],
      }),
    )
    const keys = items.map((i) => i.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
