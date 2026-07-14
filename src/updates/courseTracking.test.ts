import { describe, expect, it } from 'vitest'
import { selectableCourses, trackedCourseInfos, toggleTracked } from './courseTracking'
import type { LetusCourse } from '../parsers/letusCourses'

const u = (id: number) => `https://letus.ed.tus.ac.jp/course/view.php?id=${id}`
const c = (id: number, name: string, codes: string[] = []): LetusCourse => ({ name, url: u(id), codes })

describe('selectableCourses', () => {
  it('courseMap対象外かつ未追跡だけを名前順で返す', () => {
    const all = [c(1, '数学', ['1234567']), c(2, 'ゼミ特別'), c(3, 'アドバイジング')]
    const out = selectableCourses(all, new Set([u(1)]), [])
    expect(out.map((x) => x.name)).toEqual(['アドバイジング', 'ゼミ特別'])
  })
  it('追跡済み・重複URLは除外', () => {
    const all = [c(2, 'ゼミ特別'), c(2, 'ゼミ特別'), c(3, 'アドバイジング')]
    const out = selectableCourses(all, new Set(), [u(3)])
    expect(out.map((x) => x.url)).toEqual([u(2)])
  })
})

describe('trackedCourseInfos', () => {
  it('allから名前を解決し、見つからないURLも落とさない（取りこぼしで追跡が消えない）', () => {
    const out = trackedCourseInfos([c(2, 'ゼミ特別')], [u(2), u(9)])
    expect(out).toEqual([
      { url: u(2), name: 'ゼミ特別' },
      { url: u(9), name: '' },
    ])
  })
})

describe('toggleTracked', () => {
  it('追加と解除を反転し、元配列を壊さない', () => {
    const base = [u(1)]
    expect(toggleTracked(base, u(2))).toEqual([u(1), u(2)])
    expect(toggleTracked(base, u(1))).toEqual([])
    expect(base).toEqual([u(1)])
  })
})
