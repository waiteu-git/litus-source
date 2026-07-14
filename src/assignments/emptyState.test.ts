import { describe, it, expect } from 'vitest'
import { assignmentsEmptyState } from './emptyState'

const base = {
  liveCount: 3,
  notSubmittedCount: 2,
  submittedCount: 1,
  refreshedAt: 1000,
  healthOk: true,
  filter: 'not_submitted' as const,
}

describe('assignmentsEmptyState', () => {
  it('課題ゼロ・未同期なら unsynced', () => {
    expect(assignmentsEmptyState({ ...base, liveCount: 0, refreshedAt: 0 })).toBe('unsynced')
  })
  it('課題ゼロ・同期済みだが取得失敗なら error', () => {
    expect(assignmentsEmptyState({ ...base, liveCount: 0, refreshedAt: 1000, healthOk: false })).toBe('error')
  })
  it('未提出フィルタで未提出ゼロ・提出済みありなら done', () => {
    expect(assignmentsEmptyState({ ...base, notSubmittedCount: 0, submittedCount: 2 })).toBe('done')
  })
  it('提出済みフィルタでは done を出さない（一覧を表示）', () => {
    expect(assignmentsEmptyState({ ...base, notSubmittedCount: 0, submittedCount: 2, filter: 'submitted' })).toBe(null)
  })
  it('未提出があるなら null（一覧を表示）', () => {
    expect(assignmentsEmptyState(base)).toBe(null)
  })
})
