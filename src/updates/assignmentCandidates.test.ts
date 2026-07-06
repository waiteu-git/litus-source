import { filterAssignmentCandidates } from './assignmentCandidates'
import type { CourseLink } from '../parsers/letusLinks'

const B = 'https://letus.ed.tus.ac.jp'

describe('filterAssignmentCandidates', () => {
  it('assign/quiz/turnitin/workshop の view.php を候補として残す', () => {
    const links: CourseLink[] = [
      { title: 'レポート1', url: `${B}/mod/assign/view.php?id=1` },
      { title: '小テスト', url: `${B}/mod/quiz/view.php?id=2` },
      { title: 'Turnitin', url: `${B}/mod/turnitintooltwo/view.php?id=3` },
      { title: '相互評価', url: `${B}/mod/workshop/view.php?id=4` },
    ]
    expect(filterAssignmentCandidates(links).map((l) => l.url)).toEqual(links.map((l) => l.url))
  })
  it('資料・ページ・コーストップなど非課題モジュールを除外する', () => {
    const links: CourseLink[] = [
      { title: '講義資料', url: `${B}/mod/resource/view.php?id=5` },
      { title: '説明ページ', url: `${B}/mod/page/view.php?id=6` },
      { title: 'コース', url: `${B}/course/view.php?id=1` },
      { title: '成績', url: `${B}/grade/report/index.php?id=1` },
    ]
    expect(filterAssignmentCandidates(links)).toEqual([])
  })
  it('同一URLは重複排除する（クエリ違いは別物）', () => {
    const links: CourseLink[] = [
      { title: 'レポート1', url: `${B}/mod/assign/view.php?id=1` },
      { title: 'レポート1(再掲)', url: `${B}/mod/assign/view.php?id=1` },
      { title: 'レポート2', url: `${B}/mod/assign/view.php?id=2` },
    ]
    expect(filterAssignmentCandidates(links).map((l) => l.url)).toEqual([
      `${B}/mod/assign/view.php?id=1`,
      `${B}/mod/assign/view.php?id=2`,
    ])
  })
})
