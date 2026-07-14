import { describe, expect, it } from 'vitest'
import { buildLetusNewsContent, filterUnnotifiedNews } from './letusNewsNotify'
import type { AppendedNews } from '../updates/courseNews'

const n = (course: string, name: string, id: number): AppendedNews => ({
  courseUrl: `https://letus.ed.tus.ac.jp/course/view.php?id=${course}`,
  courseName: name,
  title: `活動${id}`,
  url: `https://letus.ed.tus.ac.jp/mod/assign/view.php?id=${id}`,
})

describe('filterUnnotifiedNews', () => {
  it('通知済みの活動URLを除外する', () => {
    const items = [n('1', '数学', 1), n('1', '数学', 2)]
    expect(filterUnnotifiedNews(items, [items[0].url])).toEqual([items[1]])
  })
})

describe('buildLetusNewsContent', () => {
  it('0件は null（発火しない）', () => {
    expect(buildLetusNewsContent([])).toBeNull()
  })
  it('1コース1件はコース名と活動名', () => {
    expect(buildLetusNewsContent([n('1', '数学', 1)])).toEqual({ title: 'LETUSに新着', body: '数学: 活動1' })
  })
  it('1コース複数件は件数', () => {
    expect(buildLetusNewsContent([n('1', '数学', 1), n('1', '数学', 2)])).toEqual({
      title: 'LETUSに新着',
      body: '数学: 新しい活動 2件',
    })
  })
  it('複数コースは合計件数＋先頭コース名 他Nコース', () => {
    expect(buildLetusNewsContent([n('1', '数学', 1), n('2', '物理', 2), n('2', '物理', 3)])).toEqual({
      title: 'LETUS新着 3件',
      body: '数学 他1コース',
    })
  })
  it('コース名が空でも文面が壊れない', () => {
    expect(buildLetusNewsContent([n('1', '', 1)])!.body).toContain('LETUSコース')
  })
})
