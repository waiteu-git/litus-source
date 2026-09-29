import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * 補講の二重表示を畳む仕組みの配線ラチェット（設計 2026-09-29 §4-4）。ソースを読んで検査する。
 *
 * 畳みは派生側（補講の発生・通知・科目詳細の行）に置き、保存データは書き換えない。だから
 * 「畳みを通さず生の events を直接読む場所」が増えると、二重が静かに戻る。tsc もロジックのテストも通ってしまうので、
 * 読む場所を機械で固定する。
 */

const ROOT = join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const subjectSrc = () => read('src/screens/SubjectDetailScreen.tsx')

/** アンカーで囲んだ範囲を切り出す。見つからなければ失敗させる（fail-open にしない）。 */
function sliceSection(src: string, startAnchor: string, endAnchor: string): string {
  const start = src.indexOf(startAnchor)
  expect(start, `開始アンカーが見つからない: ${startAnchor}`).toBeGreaterThan(-1)
  const end = src.indexOf(endAnchor, start)
  expect(end, `終端アンカーが見つからない: ${endAnchor}`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('科目詳細「各回の予定」は subjectEventRows の結果だけを描画する', () => {
  const section = () => sliceSection(subjectSrc(), 'title="各回の予定"', '</Accordion>')

  it('subjectEventRows を import して呼んでいる', () => {
    expect(subjectSrc()).toMatch(/import \{ subjectEventRows \} from '\.\.\/timetableEvents\/subjectEventRows'/)
    expect(subjectSrc()).toMatch(/subjectEventRows\(candidates,\s*events\)/)
  })

  it('範囲内で生の candidates / events を map・length で読まない（結果 eventRows 経由）', () => {
    const s = section()
    expect(s).not.toMatch(/(?<![.\w])candidates\.(map|length)/)
    expect(s).not.toMatch(/(?<![.\w])events\.(map|length)/)
  })

  it('陽性: 範囲内は eventRows.candidates / eventRows.events を読む', () => {
    const s = section()
    expect(s).toMatch(/eventRows\.candidates\.map\(/)
    expect(s).toMatch(/eventRows\.events\.map\(/)
    expect(s).toMatch(/eventRows\.candidates\.length === 0 && eventRows\.events\.length === 0/)
  })

  it('見出しのサブタイトル（表示と読み上げ名で共通）の件数も、隠した後の件数から出す', () => {
    expect(subjectSrc()).toMatch(/\$\{eventRows\.events\.length\}件/)
    expect(subjectSrc()).not.toMatch(/\$\{events\.length\}件/)
  })
})

describe('時間割・ホームは、畳んだ後の関数を通して補講を読む', () => {
  it('時間割は upcomingMakeups、ホームは todaySchedule を呼び、どちらも type=makeup を直接扱わない', () => {
    const timetable = read('src/screens/TimetableScreen.tsx')
    const home = read('src/screens/HomeScreen.tsx')
    expect(timetable).toMatch(/upcomingMakeups\(/)
    expect(home).toMatch(/todaySchedule\(/)
    expect(timetable).not.toContain("'makeup'")
    expect(home).not.toContain("'makeup'")
  })
})

describe("type 'makeup' を直接扱ってよい非テストファイルの許可リスト", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p, out)
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p)
    }
    return out
  }

  // 新しい場所が生の 'makeup' を読み始めたら、畳み（coveredStandaloneMakeups）を通しているかを確かめてから足す。
  const ALLOWED = [
    'src/attendance/courseOver.ts',
    'src/navigation/types.ts',
    'src/screens/ClassEventFormScreen.tsx',
    'src/storage/classEventsSerialize.ts',
    'src/timetableEvents/bulletinEvents.ts',
    'src/timetableEvents/classEvent.ts',
    'src/timetableEvents/classEventForm.ts',
    'src/timetableEvents/eventSchedule.ts',
    'src/timetableEvents/eventSelectors.ts',
  ]

  it("'makeup' を含む非テストファイルは許可リストと一致する", () => {
    const found = walk(join(ROOT, 'src'))
      .filter((p) => readFileSync(p, 'utf8').includes("'makeup'"))
      .map((p) => relative(ROOT, p))
      .sort()
    expect(found).toEqual([...ALLOWED].sort())
  })
})
