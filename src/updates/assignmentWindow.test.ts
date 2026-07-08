import { describe, expect, it } from 'vitest'
import { selectAssignmentsToVisit } from './assignmentWindow'
import type { Assignment, AssignmentMap } from '../storage/assignmentsSerialize'

const now = new Date('2026-07-08T00:00:00Z')

function stored(url: string, deadline: string | null): Assignment {
  return {
    url,
    courseCode: null,
    courseName: '',
    title: 't',
    deadline,
    deadlineText: '',
    submissionStatus: 'unknown',
    lifecycleStatus: 'active',
    ignored: false,
    firstSeenAt: '',
    lastSeenAt: '',
    lastCheckedAt: '',
  }
}

describe('selectAssignmentsToVisit', () => {
  it('新規（未保存）は必ず訪問', () => {
    const r = selectAssignmentsToVisit([{ url: 'a' }], {}, now)
    expect(r.map((c) => c.url)).toEqual(['a'])
  })
  it('締切不明の保存済みは再訪問', () => {
    const map: AssignmentMap = { a: stored('a', null) }
    expect(selectAssignmentsToVisit([{ url: 'a' }], map, now).length).toBe(1)
  })
  it('±14日の窓内は再訪問、窓外はスキップ', () => {
    const map: AssignmentMap = {
      near: stored('near', '2026-07-15T00:00:00Z'), // +7日 → 訪問
      future: stored('future', '2026-08-30T00:00:00Z'), // +53日 → スキップ
      old: stored('old', '2026-06-01T00:00:00Z'), // -37日 → スキップ
      recent: stored('recent', '2026-07-01T00:00:00Z'), // -7日 → 訪問
    }
    const r = selectAssignmentsToVisit(
      [{ url: 'near' }, { url: 'future' }, { url: 'old' }, { url: 'recent' }],
      map,
      now,
    )
    expect(r.map((c) => c.url).sort()).toEqual(['near', 'recent'])
  })
  it('壊れた締切文字列は再訪問（安全側）', () => {
    const map: AssignmentMap = { a: stored('a', 'not-a-date') }
    expect(selectAssignmentsToVisit([{ url: 'a' }], map, now).length).toBe(1)
  })
})
