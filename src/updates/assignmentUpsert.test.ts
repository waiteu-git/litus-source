import { upsertAssignments, type CollectedAssignment } from './assignmentUpsert'
import type { Assignment, AssignmentMap } from '../storage/assignmentsSerialize'
import { isUserManagedUrl } from '../assignments/assignmentOwnership'

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

describe('upsertAssignments ユーザー所有項目の保護', () => {
  const now = new Date('2026-07-12T00:00:00Z')
  const RES = 'https://letus.ed.tus.ac.jp/mod/resource/view.php?id=5'

  it('ユーザー所有の既存項目は締切・提出状態を上書きしない', () => {
    const existing = {
      [RES]: {
        url: RES,
        courseCode: null,
        courseName: '哲学',
        title: 'レポート課題PDF',
        deadline: '2026-07-20T14:59:00.000Z',
        deadlineText: '',
        submissionStatus: 'submitted' as const,
        lifecycleStatus: 'active' as const,
        ignored: false,
        firstSeenAt: '2026-07-01T00:00:00.000Z',
        lastSeenAt: '2026-07-01T00:00:00.000Z',
        lastCheckedAt: '2026-07-01T00:00:00.000Z',
      },
    }
    const incoming = [{
      url: RES,
      courseCode: null,
      courseName: '哲学',
      title: '別タイトル',
      deadline: null,
      deadlineText: '',
      submissionStatus: 'unknown' as const,
      lifecycleStatus: 'active' as const,
    }]
    const out = upsertAssignments(existing, incoming, now)
    expect(out[RES].deadline).toBe('2026-07-20T14:59:00.000Z')
    expect(out[RES].submissionStatus).toBe('submitted')
    expect(out[RES].title).toBe('レポート課題PDF')
    expect(out[RES].firstSeenAt).toBe('2026-07-01T00:00:00.000Z')
    expect(out[RES].lastCheckedAt).toBe(now.toISOString())
  })

  it('収集所有の既存項目は従来どおり上書きする', () => {
    const ASSIGN = 'https://letus.ed.tus.ac.jp/mod/assign/view.php?id=7'
    const existing = {
      [ASSIGN]: {
        url: ASSIGN, courseCode: null, courseName: 'A', title: '旧',
        deadline: null, deadlineText: '', submissionStatus: 'unknown' as const,
        lifecycleStatus: 'active' as const, ignored: true,
        firstSeenAt: '2026-07-01T00:00:00.000Z', lastSeenAt: '2026-07-01T00:00:00.000Z', lastCheckedAt: '2026-07-01T00:00:00.000Z',
      },
    }
    const incoming = [{
      url: ASSIGN, courseCode: null, courseName: 'A', title: '新',
      deadline: '2026-07-15T14:59:00.000Z', deadlineText: '',
      submissionStatus: 'submitted' as const, lifecycleStatus: 'active' as const,
    }]
    const out = upsertAssignments(existing, incoming, now)
    expect(out[ASSIGN].title).toBe('新')
    expect(out[ASSIGN].deadline).toBe('2026-07-15T14:59:00.000Z')
    expect(out[ASSIGN].submissionStatus).toBe('submitted')
    expect(out[ASSIGN].ignored).toBe(true) // 既存の ignored 温存は維持
    expect(out[ASSIGN].firstSeenAt).toBe('2026-07-01T00:00:00.000Z')
  })
})
