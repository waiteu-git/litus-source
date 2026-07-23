import { describe, expect, it } from 'vitest'
import {
  pickUrgentAssignment,
  pickUpcomingAssignments,
  relDue,
  urgencyTone,
  formatDeadlineRich,
  deadlineMagnitude,
} from './deadline'
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

  it('開始前(before_start・まだ受験できない)は除外する', () => {
    const before = assignment({ deadline: iso(23, 1), lifecycleStatus: 'before_start' })
    expect(pickUrgentAssignment([before], NOW)).toBeNull()
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

describe('pickUpcomingAssignments', () => {
  it('締切の近い順に最大 limit 件返す（除外条件は pickUrgentAssignment と同一）', () => {
    const a = assignment({ url: 'a', title: '一番近い', deadline: iso(15) })
    const b = assignment({ url: 'b', title: '次', deadline: iso(15, 1) })
    const c = assignment({ url: 'c', title: '三番目', deadline: iso(15, 3) })
    const submitted = assignment({ url: 's', deadline: iso(14), submissionStatus: 'submitted' })
    const overdue = assignment({ url: 'o', deadline: iso(8) })
    const got = pickUpcomingAssignments([c, submitted, a, overdue, b], NOW, 3)
    expect(got.map((x) => x.title)).toEqual(['一番近い', '次', '三番目'])
  })

  it('先頭は pickUrgentAssignment と一致する', () => {
    const a = assignment({ url: 'a', title: '近い', deadline: iso(15) })
    const b = assignment({ url: 'b', title: '遠い', deadline: iso(15, 3) })
    expect(pickUpcomingAssignments([b, a], NOW, 3)[0].title).toBe(pickUrgentAssignment([b, a], NOW)!.title)
  })

  it('limit<=0 は空配列', () => {
    const a = assignment({ url: 'a', deadline: iso(15) })
    expect(pickUpcomingAssignments([a], NOW, 0)).toEqual([])
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

describe('formatDeadlineRich', () => {
  it('今日はカレンダー同日で「今日 HH:MM」', () => {
    expect(formatDeadlineRich(iso(15), NOW)).toBe('今日 15:00')
  })
  it('翌日は「明日 HH:MM」', () => {
    expect(formatDeadlineRich(iso(9, 1), NOW)).toBe('明日 09:00')
  })
  it('それ以外は「M/D(曜) HH:MM」', () => {
    expect(formatDeadlineRich(iso(13, 3), NOW)).toMatch(/^7\/12\(.\) 13:00$/)
  })
  it('締切なしは「締切未設定」', () => {
    expect(formatDeadlineRich(null, NOW)).toBe('締切未設定')
  })
})

describe('deadlineMagnitude', () => {
  it('将来は「あとN時間」', () => {
    expect(deadlineMagnitude(iso(15), NOW)).toBe('あと3時間')
  })
  it('将来N日は「あとN日」', () => {
    expect(deadlineMagnitude(iso(12, 2), NOW)).toBe('あと2日')
  })
  it('超過は「N時間超過」', () => {
    expect(deadlineMagnitude(iso(9), NOW)).toBe('3時間超過')
  })
  it('超過N日は「N日超過」', () => {
    expect(deadlineMagnitude(iso(12, -1), NOW)).toBe('1日超過')
  })
  it('締切なしは空文字', () => {
    expect(deadlineMagnitude(null, NOW)).toBe('')
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
