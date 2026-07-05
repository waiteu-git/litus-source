import { computeCourseSignature, diffCourseSignature } from './courseUpdates'

const BASE = 'https://letus.ed.tus.ac.jp/course/view.php?id=5'

describe('computeCourseSignature', () => {
  it('/mod/*/view.phpのみ・URL重複排除・ソートして返す', () => {
    const html = `
      <a href="/mod/assign/view.php?id=101">レポート課題1</a>
      <a href="/mod/resource/view.php?id=103">講義スライド</a>
      <a href="/course/view.php?id=5">コースホーム</a>
      <a href="/mod/assign/view.php?id=101#s2">レポート課題1(再掲)</a>
    `
    const sig = computeCourseSignature(html, BASE)
    expect(sig.map((a) => a.url)).toEqual([
      'https://letus.ed.tus.ac.jp/mod/assign/view.php?id=101',
      'https://letus.ed.tus.ac.jp/mod/resource/view.php?id=103',
    ])
  })
})

describe('diffCourseSignature', () => {
  it('URLをIDに追加/削除を出す', () => {
    const prev = [{ title: 'a', url: 'u1' }, { title: 'b', url: 'u2' }]
    const next = [{ title: 'b', url: 'u2' }, { title: 'c', url: 'u3' }]
    const d = diffCourseSignature(prev, next)
    expect(d.added.map((x) => x.url)).toEqual(['u3'])
    expect(d.removed.map((x) => x.url)).toEqual(['u1'])
  })
  it('変化なしなら空', () => {
    const s = [{ title: 'a', url: 'u1' }]
    expect(diffCourseSignature(s, s)).toEqual({ added: [], removed: [] })
  })
})
