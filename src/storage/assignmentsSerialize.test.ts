import {
  serializeAssignments,
  deserializeAssignments,
  type Assignment,
} from './assignmentsSerialize'

const valid: Assignment = {
  url: 'https://letus.ed.tus.ac.jp/mod/assign/view.php?id=100',
  courseCode: '9973339',
  courseName: '基礎情報工学A',
  title: 'レポート第1回',
  deadline: '2026-07-10T14:59:00.000Z',
  deadlineText: '提出期限 2026年7月10日 23:59',
  submissionStatus: 'not_submitted',
  lifecycleStatus: 'active',
  ignored: false,
  firstSeenAt: '2026-07-06T00:00:00.000Z',
  lastSeenAt: '2026-07-06T00:00:00.000Z',
  lastCheckedAt: '2026-07-06T00:00:00.000Z',
}

describe('serialize/deserializeAssignments', () => {
  it('往復で同値', () => {
    const map = { [valid.url]: valid }
    expect(deserializeAssignments(serializeAssignments(map))).toEqual(map)
  })
  it('deadline null / courseCode null を保持する', () => {
    const a = { ...valid, deadline: null, courseCode: null }
    const map = { [a.url]: a }
    expect(deserializeAssignments(serializeAssignments(map))).toEqual(map)
  })
  it('null・壊れJSON・配列は {}', () => {
    expect(deserializeAssignments(null)).toEqual({})
    expect(deserializeAssignments('broken')).toEqual({})
    expect(deserializeAssignments('[1]')).toEqual({})
  })
  it('不正エントリは捨て、正常エントリのみ採用する', () => {
    const raw = JSON.stringify({
      [valid.url]: valid,
      'https://x/1': { ...valid, submissionStatus: 'weird' },
      'https://x/2': { ...valid, deadline: 123 },
      'https://x/3': { ...valid, courseCode: 5 },
      'https://x/4': { ...valid, ignored: 'yes' },
      'https://x/5': 'not-an-object',
    })
    expect(deserializeAssignments(raw)).toEqual({ [valid.url]: valid })
  })
})
