import { describe, expect, it } from 'vitest'
import {
  applyRunDiffs,
  markCourseSeen,
  pruneCourseNews,
  unseenCounts,
  COURSE_NEWS_TTL_MS,
  type CourseNewsMap,
} from './courseNews'

const NOW = '2026-07-14T12:00:00.000Z'
const C1 = 'https://letus.ed.tus.ac.jp/course/view.php?id=100'
const C2 = 'https://letus.ed.tus.ac.jp/course/view.php?id=200'
const a = (n: number) => ({ title: `活動${n}`, url: `https://letus.ed.tus.ac.jp/mod/assign/view.php?id=${n}` })

describe('applyRunDiffs', () => {
  it('増分を累積し appended に返す', () => {
    const { next, appended } = applyRunDiffs({}, [{ url: C1, name: '数学', added: [a(1), a(2)] }], NOW)
    expect(next[C1].name).toBe('数学')
    expect(next[C1].items.map((i) => i.url)).toEqual([a(1).url, a(2).url])
    expect(next[C1].items[0].detectedAt).toBe(NOW)
    expect(appended).toHaveLength(2)
    expect(appended[0]).toEqual({ courseUrl: C1, courseName: '数学', title: '活動1', url: a(1).url })
  })

  it('同じ活動URLは二度追加しない（冪等・2経路転記対策）', () => {
    const first = applyRunDiffs({}, [{ url: C1, name: '数学', added: [a(1)] }], NOW).next
    const { next, appended } = applyRunDiffs(first, [{ url: C1, name: '数学', added: [a(1), a(2)] }], NOW)
    expect(next[C1].items).toHaveLength(2)
    expect(appended.map((x) => x.url)).toEqual([a(2).url])
  })

  it('added空のdiffは無視・変化がなければ同一参照', () => {
    const prev: CourseNewsMap = { [C1]: { name: '数学', items: [{ ...a(1), detectedAt: NOW }] } }
    const { next, appended } = applyRunDiffs(prev, [{ url: C2, name: '物理', added: [] }], NOW)
    expect(next).toBe(prev)
    expect(appended).toHaveLength(0)
  })

  it('コース名は最新runで更新される', () => {
    const prev = applyRunDiffs({}, [{ url: C1, name: '数学', added: [a(1)] }], NOW).next
    const { next } = applyRunDiffs(prev, [{ url: C1, name: '数学IB', added: [a(2)] }], NOW)
    expect(next[C1].name).toBe('数学IB')
  })
})

describe('markCourseSeen', () => {
  it('コースごと消える（見たら消えるライフサイクル）', () => {
    const map = applyRunDiffs({}, [{ url: C1, name: '数学', added: [a(1)] }], NOW).next
    const next = markCourseSeen(map, C1)
    expect(next[C1]).toBeUndefined()
  })
  it('無いコースは同一参照', () => {
    const map: CourseNewsMap = {}
    expect(markCourseSeen(map, C1)).toBe(map)
  })
})

describe('pruneCourseNews', () => {
  it('TTL超過の活動を落とし、空コースを掃除する', () => {
    const old = new Date(new Date(NOW).getTime() - COURSE_NEWS_TTL_MS - 1000).toISOString()
    const map: CourseNewsMap = {
      [C1]: { name: '数学', items: [{ ...a(1), detectedAt: old }] },
      [C2]: {
        name: '物理',
        items: [
          { ...a(2), detectedAt: old },
          { ...a(3), detectedAt: NOW },
        ],
      },
    }
    const next = pruneCourseNews(map, NOW)
    expect(next[C1]).toBeUndefined()
    expect(next[C2].items.map((i) => i.url)).toEqual([a(3).url])
  })
  it('全件TTL内なら同一参照（無駄な保存を避ける）', () => {
    const map: CourseNewsMap = { [C1]: { name: '数学', items: [{ ...a(1), detectedAt: NOW }] } }
    expect(pruneCourseNews(map, NOW)).toBe(map)
  })
  it('detectedAt破損はTTL超過扱いで落とす', () => {
    const map: CourseNewsMap = { [C1]: { name: '数学', items: [{ ...a(1), detectedAt: 'broken' }] } }
    expect(pruneCourseNews(map, NOW)[C1]).toBeUndefined()
  })
})

describe('unseenCounts', () => {
  it('コースURL→件数', () => {
    const map = applyRunDiffs({}, [{ url: C1, name: '数学', added: [a(1), a(2)] }], NOW).next
    expect(unseenCounts(map)).toEqual({ [C1]: 2 })
  })
})
