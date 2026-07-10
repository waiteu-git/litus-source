import { describe, expect, it } from 'vitest'
import { pickUrgentAssignment, relDue, urgencyTone } from './deadline'
import type { Assignment } from '../storage/assignmentsSerialize'

const NOW = new Date(2026, 6, 9, 12, 0) // 2026-07-09 12:00

function assignment(over: Partial<Assignment>): Assignment {
  return {
    url: over.url ?? 'https://letus/a',
    courseCode: null,
    courseName: '情報理論',
    title: 'レポート',
    deadline: null,
    deadlineText: '',
    submissionStatus: 'not_submitted',
    lifecycleStatus: 'active',
    ignored: false,
    firstSeenAt: '',
    lastSeenAt: '',
    lastCheckedAt: '',
    ...over,
  }
}

const iso = (h: number, dayOffset = 0) => new Date(2026, 6, 9 + dayOffset, h, 0).toISOString()

describe('pickUrgentAssignment', () => {
  it('候補が無ければ null', () => {
    expect(pickUrgentAssignment([], NOW)).toBeNull()
  })

  it('未提出で締切が最も近い将来の課題を返す', () => {
    const a = assignment({ url: 'a', title: '近い', deadline: iso(15) })
    const b = assignment({ url: 'b', title: '遠い', deadline: iso(15, 3) })
    expect(pickUrgentAssignment([b, a], NOW)!.title).toBe('近い')
  })

  it('提出済み・非表示・締切超過・締切未設定は除外する', () => {
    const submitted = assignment({ url: 's', deadline: iso(14), submissionStatus: 'submitted' })
    const ignored = assignment({ url: 'i', deadline: iso(14), ignored: true })
    const overdue = assignment({ url: 'o', deadline: iso(8) })
    const noDeadline = assignment({ url: 'n', deadline: null })
    const valid = assignment({ url: 'v', title: '有効', deadline: iso(18) })
    expect(pickUrgentAssignment([submitted, ignored, overdue, noDeadline, valid], NOW)!.title).toBe('有効')
  })

  it('有効な候補が無ければ null', () => {
    const overdue = assignment({ url: 'o', deadline: iso(8) })
    expect(pickUrgentAssignment([overdue], NOW)).toBeNull()
  })
})

describe('relDue', () => {
  it('24時間以内は「あとN時間」', () => {
    expect(relDue(iso(15), NOW)).toBe('あと3時間')
  })
  it('締切超過は「締切超過」', () => {
    expect(relDue(iso(8), NOW)).toBe('締切超過')
  })
})

describe('urgencyTone', () => {
  it('24h以内は red', () => {
    expect(urgencyTone(assignment({ deadline: iso(15) }), NOW)).toBe('red')
  })
  it('提出済みは gray', () => {
    expect(urgencyTone(assignment({ deadline: iso(15), submissionStatus: 'completed' }), NOW)).toBe('gray')
  })
})
