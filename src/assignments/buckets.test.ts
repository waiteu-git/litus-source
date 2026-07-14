import { bucketAssignments, BUCKET_ORDER, type BucketKey } from './buckets'
import type { Assignment } from '../storage/assignmentsSerialize'

// ローカル時刻で now とdeadlineを組み立て、TZ差に依存しないようにする。
const now = new Date(2026, 6, 6, 10, 0, 0) // 2026-07-06(月) 10:00 ローカル
function localIso(y: number, mo: number, d: number, h = 23, mi = 59): string {
  return new Date(y, mo - 1, d, h, mi, 0, 0).toISOString()
}

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
    firstSeenAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    lastCheckedAt: now.toISOString(),
    ...over,
  }
}

function keyOf(list: Assignment[], out: Record<BucketKey, Assignment[]>): BucketKey | undefined {
  return BUCKET_ORDER.find((k) => out[k].some((x) => list.includes(x)))
}

describe('bucketAssignments', () => {
  it('締切帯で振り分ける（今日はカレンダー同日）', () => {
    const today = a({ url: 'w', deadline: localIso(2026, 7, 6, 20, 0) }) // 今日夜
    const tomorrow = a({ url: 't', deadline: localIso(2026, 7, 7, 23, 59) }) // 明日
    const week = a({ url: 'k', deadline: localIso(2026, 7, 10, 23, 59) }) // 今週
    const later = a({ url: 'l', deadline: localIso(2026, 7, 30, 23, 59) }) // それ以降
    const out = bucketAssignments([today, tomorrow, week, later], now)
    expect(out.today.map((x) => x.url)).toEqual(['w'])
    expect(out.tomorrow.map((x) => x.url)).toEqual(['t'])
    expect(out.thisWeek.map((x) => x.url)).toEqual(['k'])
    expect(out.later.map((x) => x.url)).toEqual(['l'])
  })
  it('翌日カレンダー(9:00・24h以内)は今日でなく明日', () => {
    const soon = a({ url: 's', deadline: localIso(2026, 7, 7, 9, 0) }) // 明日9:00=23h先だが翌日
    const out = bucketAssignments([soon], now)
    expect(out.today).toEqual([])
    expect(out.tomorrow.map((x) => x.url)).toEqual(['s'])
  })
  it('提出済み・完了は締切に関わらず submitted', () => {
    const sub = a({ url: 's', deadline: localIso(2026, 7, 6, 20, 0), submissionStatus: 'submitted' })
    const comp = a({ url: 'c', deadline: localIso(2026, 7, 6, 20, 0), submissionStatus: 'completed' })
    const out = bucketAssignments([sub, comp], now)
    expect(out.submitted.map((x) => x.url)).toEqual(['s', 'c'])
    expect(out.today).toEqual([])
  })
  it('開始前は beforeStart、期限切れ未提出は overdue', () => {
    const before = a({ url: 'b', lifecycleStatus: 'before_start', deadline: null })
    const over = a({ url: 'o', deadline: localIso(2026, 7, 5, 23, 59) }) // 昨日
    const out = bucketAssignments([before, over], now)
    expect(out.beforeStart.map((x) => x.url)).toEqual(['b'])
    expect(out.overdue.map((x) => x.url)).toEqual(['o'])
  })
  it('締切なしの未提出は later', () => {
    const out = bucketAssignments([a({ url: 'n', deadline: null })], now)
    expect(out.later.map((x) => x.url)).toEqual(['n'])
  })
  it('ignored は既定で全バケットから除外', () => {
    const out = bucketAssignments([a({ url: 'x', deadline: localIso(2026, 7, 6, 20, 0), ignored: true })], now)
    for (const k of BUCKET_ORDER) expect(out[k]).toEqual([])
  })
  it('各バケット内は締切昇順', () => {
    const late = a({ url: 'late', deadline: localIso(2026, 7, 12, 23, 59) })
    const early = a({ url: 'early', deadline: localIso(2026, 7, 9, 23, 59) })
    const out = bucketAssignments([late, early], now)
    expect(out.thisWeek.map((x) => x.url)).toEqual(['early', 'late'])
  })
})
