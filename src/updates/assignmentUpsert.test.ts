import { upsertAssignments, type CollectedAssignment } from './assignmentUpsert'
import type { Assignment, AssignmentMap } from '../storage/assignmentsSerialize'

const T0 = '2026-07-06T00:00:00.000Z'
const T1 = new Date('2026-07-07T00:00:00.000Z')

function collected(over: Partial<CollectedAssignment> = {}): CollectedAssignment {
  return {
    url: 'https://letus.ed.tus.ac.jp/mod/assign/view.php?id=1',
    courseCode: '9973339',
    courseName: '基礎情報工学A',
    title: 'レポート第1回',
    deadline: '2026-07-10T14:59:00.000Z',
    deadlineText: '提出期限 2026年7月10日 23:59',
    submissionStatus: 'not_submitted',
    lifecycleStatus: 'active',
    ...over,
  }
}

function stored(over: Partial<Assignment> = {}): Assignment {
  return {
    ...collected(),
    ignored: false,
    firstSeenAt: T0,
    lastSeenAt: T0,
    lastCheckedAt: T0,
    ...over,
  }
}

describe('upsertAssignments', () => {
  it('新規は firstSeen/lastSeen/lastChecked を now、ignored=false で追加', () => {
    const out = upsertAssignments({}, [collected()], T1)
    const a = out['https://letus.ed.tus.ac.jp/mod/assign/view.php?id=1']
    expect(a.firstSeenAt).toBe(T1.toISOString())
    expect(a.lastSeenAt).toBe(T1.toISOString())
    expect(a.lastCheckedAt).toBe(T1.toISOString())
    expect(a.ignored).toBe(false)
    expect(a.submissionStatus).toBe('not_submitted')
  })
  it('既存の再収集は firstSeenAt と ignored を保持し、状態と lastSeen/lastChecked を更新', () => {
    const existing: AssignmentMap = { [stored().url]: stored({ ignored: true }) }
    const out = upsertAssignments(existing, [collected({ submissionStatus: 'submitted', lifecycleStatus: 'submitted' })], T1)
    const a = out[stored().url]
    expect(a.firstSeenAt).toBe(T0)
    expect(a.ignored).toBe(true)
    expect(a.submissionStatus).toBe('submitted')
    expect(a.lifecycleStatus).toBe('submitted')
    expect(a.lastSeenAt).toBe(T1.toISOString())
    expect(a.lastCheckedAt).toBe(T1.toISOString())
  })
  it('今回訪問しなかった既存課題はそのまま残す', () => {
    const other = stored({ url: 'https://letus.ed.tus.ac.jp/mod/quiz/view.php?id=9' })
    const out = upsertAssignments({ [other.url]: other }, [collected()], T1)
    expect(out[other.url]).toEqual(other)
    expect(Object.keys(out)).toHaveLength(2)
  })
  it('入力を破壊しない', () => {
    const existing: AssignmentMap = { [stored().url]: stored() }
    const snapshot = JSON.parse(JSON.stringify(existing))
    upsertAssignments(existing, [collected({ title: '変更後' })], T1)
    expect(existing).toEqual(snapshot)
  })
})
