import {
  extractLinksFromHtml,
  isTargetActivityUrl,
  isClearlyNonAssignmentUrl,
  hasAssignmentKeyword,
  isAssignmentLikeLink,
  extractAssignmentLinks,
} from './letusLinks'
import { COURSE_BASE_URL, LINKS_HTML, COURSE_PAGE } from './letusLinks.fixtures'

const base = COURSE_BASE_URL

describe('extractLinksFromHtml', () => {
  it('相対hrefを絶対URL化しフラグメントを除去する', () => {
    const links = extractLinksFromHtml(LINKS_HTML, base)
    const assign = links.find((l) => l.title === 'レポート課題1')
    expect(assign?.url).toBe('https://letus.ed.tus.ac.jp/mod/assign/view.php?id=101')
  })

  it('タイトルが空/画像のみのリンクは除外する', () => {
    const links = extractLinksFromHtml(LINKS_HTML, base)
    expect(links).toHaveLength(2)
    expect(links.map((l) => l.title)).toEqual(['レポート課題1', '第1回小テスト'])
  })
})

describe('isTargetActivityUrl', () => {
  it('strictはassign/quiz/turnitinを対象にする', () => {
    expect(isTargetActivityUrl('/mod/assign/view.php?id=1', 'strict')).toBe(true)
    expect(isTargetActivityUrl('/mod/quiz/view.php?id=1', 'strict')).toBe(true)
    expect(isTargetActivityUrl('/mod/workshop/view.php?id=1', 'strict')).toBe(false)
  })

  it('standardはworkshopを含みforumは含まない', () => {
    expect(isTargetActivityUrl('/mod/workshop/view.php?id=1', 'standard')).toBe(true)
    expect(isTargetActivityUrl('/mod/forum/view.php?id=1', 'standard')).toBe(false)
  })

  it('broadはforumも対象にする', () => {
    expect(isTargetActivityUrl('/mod/forum/view.php?id=1', 'broad')).toBe(true)
  })
})

describe('isClearlyNonAssignmentUrl', () => {
  it('resource/course/gradeは非課題', () => {
    expect(isClearlyNonAssignmentUrl('/mod/resource/view.php?id=1')).toBe(true)
    expect(isClearlyNonAssignmentUrl('/course/view.php?id=1')).toBe(true)
    expect(isClearlyNonAssignmentUrl('/grade/report/user/index.php')).toBe(true)
  })

  it('assignは除外対象ではない', () => {
    expect(isClearlyNonAssignmentUrl('/mod/assign/view.php?id=1')).toBe(false)
  })
})

describe('hasAssignmentKeyword', () => {
  it('本文に課題系キーワードがあればtrue', () => {
    expect(hasAssignmentKeyword('レポート提出フォーム', '/mod/portfolio/view.php')).toBe(true)
  })

  it('無関係な語ならfalse', () => {
    expect(hasAssignmentKeyword('コースホーム', '/course/view.php')).toBe(false)
  })
})

describe('isAssignmentLikeLink', () => {
  it('assignリンクはstandardで課題扱い', () => {
    expect(isAssignmentLikeLink('レポート課題1', '/mod/assign/view.php?id=1', 'standard')).toBe(true)
  })

  it('resourceは常に除外', () => {
    expect(isAssignmentLikeLink('講義スライド', '/mod/resource/view.php?id=1', 'broad')).toBe(false)
  })

  it('forumはstandardでは除外・broadで課題扱い', () => {
    expect(isAssignmentLikeLink('お知らせ', '/mod/forum/view.php?id=1', 'standard')).toBe(false)
    expect(isAssignmentLikeLink('お知らせ', '/mod/forum/view.php?id=1', 'broad')).toBe(true)
  })

  it('未知モジュールでもbroadはキーワードで拾う', () => {
    expect(isAssignmentLikeLink('レポート提出', '/mod/portfolio/view.php?id=1', 'standard')).toBe(
      false,
    )
    expect(isAssignmentLikeLink('レポート提出', '/mod/portfolio/view.php?id=1', 'broad')).toBe(true)
  })

  it('短すぎるテキストは除外', () => {
    expect(isAssignmentLikeLink('a', '/mod/assign/view.php?id=1', 'standard')).toBe(false)
  })
})

describe('extractAssignmentLinks', () => {
  it('standardは課題と小テストのみ返しURL重複を排除する', () => {
    const links = extractAssignmentLinks(COURSE_PAGE, base, 'standard')
    expect(links.map((l) => l.url)).toEqual([
      'https://letus.ed.tus.ac.jp/mod/assign/view.php?id=101',
      'https://letus.ed.tus.ac.jp/mod/quiz/view.php?id=102',
    ])
  })

  it('broadはフォーラムとキーワードリンクも追加する', () => {
    const links = extractAssignmentLinks(COURSE_PAGE, base, 'broad')
    expect(links).toHaveLength(4)
    expect(links.map((l) => l.url)).toContain(
      'https://letus.ed.tus.ac.jp/mod/forum/view.php?id=104',
    )
    expect(links.map((l) => l.url)).toContain(
      'https://letus.ed.tus.ac.jp/mod/portfolio/view.php?id=106',
    )
  })
})
