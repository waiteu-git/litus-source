import {
  htmlToPlainText,
  extractDeadlineText,
  parseDeadline,
  extractSubmissionStatus,
  resolveLifecycleStatus,
  parseAssignmentPage,
} from './letus'
import {
  ASSIGN_NOT_SUBMITTED,
  ASSIGN_SUBMITTED,
  ASSIGN_PASSED,
  ASSIGN_NO_YEAR,
  ASSIGN_BEFORE_START,
  ASSIGN_START_ONLY,
  QUIZ_FINISHED,
  QUIZ_NOT_ATTEMPTED,
  HTML_NOISE,
} from './letus.fixtures'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ASSIGN_URL = 'https://letus.ed.tus.ac.jp/mod/assign/view.php?id=1'
const QUIZ_URL = 'https://letus.ed.tus.ac.jp/mod/quiz/view.php?id=2'

// 実DOM回帰: mod/assign 提出ステータス表（2026-07-10実測）。実際の文言は「まだ提出されていません」
// （旧実装が unknown を返した真因）／「評定のために提出済み」。実サイトのDOM変更を検知する番人。
describe('extractSubmissionStatus（実DOMフィクスチャ）', () => {
  const notSubmitted = readFileSync(
    fileURLToPath(new URL('./__fixtures__/assign-not-submitted-real.html', import.meta.url)),
    'utf-8',
  )
  const submitted = readFileSync(
    fileURLToPath(new URL('./__fixtures__/assign-submitted-real.html', import.meta.url)),
    'utf-8',
  )
  it('「まだ提出されていません」→ not_submitted（旧実装は unknown だった）', () => {
    expect(parseAssignmentPage(notSubmitted, ASSIGN_URL).submissionStatus).toBe('not_submitted')
  })
  it('「評定のために提出済み」→ submitted', () => {
    expect(parseAssignmentPage(submitted, ASSIGN_URL).submissionStatus).toBe('submitted')
  })
})

describe('htmlToPlainText', () => {
  it('scriptを除去しエンティティを復号する', () => {
    const t = htmlToPlainText(HTML_NOISE)
    expect(t).toContain('A&B')
    expect(t).toContain('C')
    expect(t).not.toContain('evil')
    expect(t).not.toContain('<x>')
  })
})

describe('parseDeadline', () => {
  it('年月日時分の日本語日付をローカル時刻でパースする', () => {
    const iso = parseDeadline('提出期限 2026年 7月 15日(水曜日) 23:59')
    expect(iso).not.toBeNull()
    const d = new Date(iso!)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(6)
    expect(d.getDate()).toBe(15)
    expect(d.getHours()).toBe(23)
    expect(d.getMinutes()).toBe(59)
  })

  it('時刻がない場合は23:59に補完する', () => {
    const iso = parseDeadline('提出期限 2026年 7月 15日')
    const d = new Date(iso!)
    expect(d.getHours()).toBe(23)
    expect(d.getMinutes()).toBe(59)
  })

  it('年がない場合は当年で補完する', () => {
    const iso = parseDeadline('提出期限 7月 15日 23:59')
    const d = new Date(iso!)
    expect(d.getFullYear()).toBe(new Date().getFullYear())
    expect(d.getMonth()).toBe(6)
    expect(d.getDate()).toBe(15)
  })

  it('日付が見つからなければ null', () => {
    expect(parseDeadline('期限は未定です')).toBeNull()
  })
})

describe('extractDeadlineText', () => {
  it('締切キーワード位置から本文を切り出す', () => {
    const text = htmlToPlainText(ASSIGN_NOT_SUBMITTED)
    const slice = extractDeadlineText(text)
    expect(slice).toContain('提出期限')
    expect(slice).toContain('2026年')
    expect(slice.startsWith('提出ステータス')).toBe(false)
  })

  it('締切キーワードがなく開始情報のみなら空文字', () => {
    const text = htmlToPlainText(ASSIGN_START_ONLY)
    expect(extractDeadlineText(text)).toBe('')
  })
})

describe('extractSubmissionStatus', () => {
  it('assign 未提出 を not_submitted にする', () => {
    const text = htmlToPlainText(ASSIGN_NOT_SUBMITTED)
    expect(extractSubmissionStatus(text, ASSIGN_URL)).toBe('not_submitted')
  })

  it('assign 提出済み を submitted にする', () => {
    const text = htmlToPlainText(ASSIGN_SUBMITTED)
    expect(extractSubmissionStatus(text, ASSIGN_URL)).toBe('submitted')
  })

  it('quiz ステータス終了 を completed にする', () => {
    const text = htmlToPlainText(QUIZ_FINISHED)
    expect(extractSubmissionStatus(text, QUIZ_URL)).toBe('completed')
  })

  it('quiz 未受験 を not_submitted にする', () => {
    const text = htmlToPlainText(QUIZ_NOT_ATTEMPTED)
    expect(extractSubmissionStatus(text, QUIZ_URL)).toBe('not_submitted')
  })
})

describe('resolveLifecycleStatus', () => {
  it('開始前ページは before_start', () => {
    const text = htmlToPlainText(ASSIGN_BEFORE_START)
    expect(resolveLifecycleStatus(text, 'unknown', null)).toBe('before_start')
  })

  it('提出済みは submitted（締切が過去でも）', () => {
    expect(resolveLifecycleStatus('提出済み', 'submitted', '2020-01-01T00:00:00.000Z')).toBe(
      'submitted',
    )
  })

  it('未提出で締切超過は passed', () => {
    expect(resolveLifecycleStatus('未提出', 'not_submitted', '2020-01-01T00:00:00.000Z')).toBe(
      'passed',
    )
  })

  it('未提出で締切前は active', () => {
    expect(resolveLifecycleStatus('未提出', 'not_submitted', '2100-01-01T00:00:00.000Z')).toBe(
      'active',
    )
  })
})

describe('parseAssignmentPage', () => {
  it('未提出・未来締切の課題ページを構造化する', () => {
    const r = parseAssignmentPage(ASSIGN_NOT_SUBMITTED, ASSIGN_URL)
    expect(r.submissionStatus).toBe('not_submitted')
    expect(r.lifecycleStatus).toBe('active')
    expect(r.deadline).not.toBeNull()
    expect(new Date(r.deadline!).getFullYear()).toBe(2026)
  })

  it('過去締切・未提出は passed', () => {
    const r = parseAssignmentPage(ASSIGN_PASSED, ASSIGN_URL)
    expect(r.submissionStatus).toBe('not_submitted')
    expect(r.lifecycleStatus).toBe('passed')
  })

  it('年なし締切は当年で補完する', () => {
    const r = parseAssignmentPage(ASSIGN_NO_YEAR, ASSIGN_URL)
    expect(r.deadline).not.toBeNull()
    expect(new Date(r.deadline!).getFullYear()).toBe(new Date().getFullYear())
  })

  it('開始前ページは deadline=null・before_start', () => {
    const r = parseAssignmentPage(ASSIGN_BEFORE_START, ASSIGN_URL)
    expect(r.deadline).toBeNull()
    expect(r.lifecycleStatus).toBe('before_start')
  })

  it('小テスト終了は completed', () => {
    const r = parseAssignmentPage(QUIZ_FINISHED, QUIZ_URL)
    expect(r.submissionStatus).toBe('completed')
    expect(r.lifecycleStatus).toBe('submitted')
  })
})
