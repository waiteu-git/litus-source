import { describe, expect, it } from 'vitest'
import { HINTS, dismissHint, visibleHint, type HintKey } from './hints'

describe('visibleHint', () => {
  it('未クローズなら定義済みヒントを返す', () => {
    expect(visibleHint('home', [])).toEqual(HINTS.home)
  })
  it('クローズ済みなら null', () => {
    expect(visibleHint('home', ['home'])).toBeNull()
  })
  it('無関係なキーや未知の値が混ざっていても影響しない', () => {
    expect(visibleHint('assignments', ['home', 'unknown-x'])).toEqual(HINTS.assignments)
  })
})

describe('dismissHint', () => {
  it('追加は冪等・元配列は不変', () => {
    const base = ['home']
    expect(dismissHint(base, 'timetable')).toEqual(['home', 'timetable'])
    expect(dismissHint(base, 'home')).toEqual(['home'])
    expect(base).toEqual(['home'])
  })
})

describe('HINTS', () => {
  it('全キーに簡潔な題と本文がある', () => {
    const keys: HintKey[] = ['home', 'timetable', 'assignments', 'attendance', 'bulletins']
    for (const k of keys) {
      expect(HINTS[k].title.length).toBeGreaterThan(0)
      expect(HINTS[k].body.length).toBeGreaterThan(10)
    }
  })
})
