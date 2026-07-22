import { describe, expect, it } from 'vitest'
import {
  MANUAL_PREFIX,
  isManualUrl,
  assignmentScreenFor,
  parseDeadlineInput,
  formatDeadlineText,
  splitDeadline,
  makeManualAssignment,
  makeUserManagedActivity,
} from './manualAssignment'

describe('parseDeadlineInput', () => {
  it('日付＋時刻をISOに（ローカル→UTC ISO往復で一致）', () => {
    const iso = parseDeadlineInput('2026/07/15', '23:59')
    expect(iso).not.toBeNull()
    const d = new Date(iso as string)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(6)
    expect(d.getDate()).toBe(15)
    expect(d.getHours()).toBe(23)
    expect(d.getMinutes()).toBe(59)
  })
  it('ハイフン区切りも可', () => {
    expect(parseDeadlineInput('2026-7-1', '9:05')).not.toBeNull()
  })
  it('時刻空欄は23:59を既定', () => {
    const d = new Date(parseDeadlineInput('2026/07/15', '') as string)
    expect(d.getHours()).toBe(23)
    expect(d.getMinutes()).toBe(59)
  })
  it('日付空欄はnull（締切なし）', () => {
    expect(parseDeadlineInput('', '10:00')).toBeNull()
  })
  it('存在しない日付は弾く', () => {
    expect(parseDeadlineInput('2026/02/31', '10:00')).toBeNull()
  })
  it('不正な時刻は弾く', () => {
    expect(parseDeadlineInput('2026/07/15', '25:00')).toBeNull()
    expect(parseDeadlineInput('2026/07/15', '10:99')).toBeNull()
  })
})

describe('formatDeadlineText / splitDeadline', () => {
  it('ISO→表示、往復でsplitが一致', () => {
    const iso = parseDeadlineInput('2026/07/15', '08:05') as string
    expect(formatDeadlineText(iso)).toBe('2026/07/15 08:05')
    expect(splitDeadline(iso)).toEqual({ date: '2026/07/15', time: '08:05' })
  })
  it('nullは締切なし/空', () => {
    expect(formatDeadlineText(null)).toBe('締切なし')
    expect(splitDeadline(null)).toEqual({ date: '', time: '' })
  })
})

describe('makeManualAssignment', () => {
  const now = '2026-07-09T00:00:00.000Z'
  it('手動フラグ・未提出・注入したidとnowで組み立てる', () => {
    const iso = parseDeadlineInput('2026/07/20', '17:00') as string
    const a = makeManualAssignment({ title: ' レポート ', courseName: ' 哲学 ', deadline: iso }, `${MANUAL_PREFIX}abc`, now)
    expect(a.url).toBe(`${MANUAL_PREFIX}abc`)
    expect(isManualUrl(a.url)).toBe(true)
    expect(a.manual).toBe(true)
    expect(a.title).toBe('レポート')
    expect(a.courseName).toBe('哲学')
    expect(a.submissionStatus).toBe('not_submitted')
    expect(a.deadline).toBe(iso)
    expect(a.firstSeenAt).toBe(now)
  })
  it('科目名が空なら「手動追加」', () => {
    const a = makeManualAssignment({ title: 'X', courseName: '  ', deadline: null }, `${MANUAL_PREFIX}z`, now)
    expect(a.courseName).toBe('手動追加')
    expect(a.deadlineText).toBe('締切なし')
  })
})

describe('makeUserManagedActivity', () => {
  const now = '2026-07-12T00:00:00.000Z'
  const URL = 'https://letus.ed.tus.ac.jp/mod/resource/view.php?id=5'

  it('実URLを保持し締切とnot_submittedで初期化する', () => {
    const a = makeUserManagedActivity(
      { url: URL, title: '  レポートPDF ', courseName: ' 哲学 ', deadline: '2026-07-20T14:59:00.000Z' },
      now,
    )
    expect(a.url).toBe(URL)
    expect(a.title).toBe('レポートPDF')
    expect(a.courseName).toBe('哲学')
    expect(a.deadline).toBe('2026-07-20T14:59:00.000Z')
    expect(a.submissionStatus).toBe('not_submitted')
    expect(a.lifecycleStatus).toBe('active')
    expect(a.ignored).toBe(false)
    expect(a.manual).toBeUndefined()
    expect(a.firstSeenAt).toBe(now)
  })

  it('締切なし・科目名空でも安全に組み立てる', () => {
    const a = makeUserManagedActivity({ url: URL, title: 'X', courseName: '   ', deadline: null }, now)
    expect(a.deadline).toBeNull()
    expect(a.deadlineText).toBe('締切なし')
    expect(a.courseName).toBe('追加')
  })
})

describe('assignmentScreenFor', () => {
  // 通知タップ経路が isManualUrl を見ておらず、手動課題のリマインドをタップすると
  // LETUS用の画面へ飛んでいた（HomeScreen だけが出し分けていた＝判定の二重定義）。
  it('手動課題は ManualAssignment へ', () => {
    expect(assignmentScreenFor('manual://abc')).toBe('ManualAssignment')
  })
  it('LETUSの課題は LetusAssignmentDetail へ', () => {
    expect(assignmentScreenFor('https://letus.ed.tus.ac.jp/mod/assign/view.php?id=1')).toBe('LetusAssignmentDetail')
  })
})
