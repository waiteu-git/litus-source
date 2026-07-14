import { describe, it, expect } from 'vitest'
import { homeDeadlineBand, homeDeadlines } from './homeDeadlines'
import type { Assignment } from '../storage/assignmentsSerialize'

const NOW = new Date(2026, 6, 13, 14, 0) // 2026-07-13(月) 14:00
const iso = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString()

function a(over: Partial<Assignment>): Assignment {
  return {
    url: over.url ?? 'u',
    courseCode: null,
    courseName: '科目',
    title: 'T',
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

describe('homeDeadlineBand', () => {
  it('今日18:00までは evening、以降今夜は tonight', () => {
    expect(homeDeadlineBand(iso(2026, 7, 13, 17, 0), NOW)).toBe('evening')
    expect(homeDeadlineBand(iso(2026, 7, 13, 23, 59), NOW)).toBe('tonight')
  })
  it('超過は null', () => {
    expect(homeDeadlineBand(iso(2026, 7, 13, 13, 0), NOW)).toBe(null)
  })
  it('翌日以降7日以内は thisWeek、以遠は later', () => {
    expect(homeDeadlineBand(iso(2026, 7, 16, 23, 59), NOW)).toBe('thisWeek')
    expect(homeDeadlineBand(iso(2026, 7, 28, 23, 59), NOW)).toBe('later')
  })
})

describe('homeDeadlines', () => {
  it('締切昇順・バンド順にまとめ、提出済みは done=true、超過は除外', () => {
    const list = [
      a({ url: 'past', deadline: iso(2026, 7, 13, 9, 0) }), // 超過→除外
      a({ url: 'tonight', deadline: iso(2026, 7, 13, 23, 59) }),
      a({ url: 'evening', deadline: iso(2026, 7, 13, 17, 0), submissionStatus: 'submitted' }),
      a({ url: 'week', deadline: iso(2026, 7, 16, 23, 59) }),
    ]
    const groups = homeDeadlines(list, NOW)
    expect(groups.map((g) => g.band)).toEqual(['evening', 'tonight', 'thisWeek'])
    expect(groups[0].items[0].a.url).toBe('evening')
    expect(groups[0].items[0].done).toBe(true)
    expect(groups[1].items[0].a.url).toBe('tonight')
  })
  it('開始前(before_start)はまだ提出できないので除外', () => {
    const list = [
      a({ url: 'open', deadline: iso(2026, 7, 16, 23, 59) }),
      a({ url: 'notyet', deadline: iso(2026, 7, 16, 23, 59), lifecycleStatus: 'before_start' }),
    ]
    const urls = homeDeadlines(list, NOW).flatMap((g) => g.items.map((i) => i.a.url))
    expect(urls).toEqual(['open'])
  })
  it('limit で件数を絞る', () => {
    const list = Array.from({ length: 8 }, (_, i) => a({ url: `x${i}`, deadline: iso(2026, 7, 16, 10, i) }))
    const groups = homeDeadlines(list, NOW, 3)
    expect(groups.flatMap((g) => g.items).length).toBe(3)
  })
})
