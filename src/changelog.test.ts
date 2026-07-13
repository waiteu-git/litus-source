import { describe, expect, it } from 'vitest'
import { CHANGELOG, getRecentChangelog, sortChangelogDesc, type ChangelogEntry } from './changelog'

const SAMPLE: ChangelogEntry[] = [
  { build: 70, date: '2026/07/12', items: ['a'] },
  { build: 72, date: '2026/07/13', items: ['b'] },
  { build: 71, date: '2026/07/12', items: ['c'] },
]

describe('sortChangelogDesc', () => {
  it('build番号の降順に並べ替える', () => {
    expect(sortChangelogDesc(SAMPLE).map((e) => e.build)).toEqual([72, 71, 70])
  })

  it('元の配列を変更しない', () => {
    const before = SAMPLE.map((e) => e.build)
    sortChangelogDesc(SAMPLE)
    expect(SAMPLE.map((e) => e.build)).toEqual(before)
  })
})

describe('getRecentChangelog', () => {
  it('新しい順に先頭count件を返す', () => {
    expect(getRecentChangelog(SAMPLE, 2).map((e) => e.build)).toEqual([72, 71])
  })

  it('countが件数を超える場合は全件を返す', () => {
    expect(getRecentChangelog(SAMPLE, 10).map((e) => e.build)).toEqual([72, 71, 70])
  })

  it('count=0のときは空配列を返す', () => {
    expect(getRecentChangelog(SAMPLE, 0)).toEqual([])
  })

  it('countが負のときも空配列を返す', () => {
    expect(getRecentChangelog(SAMPLE, -1)).toEqual([])
  })
})

describe('CHANGELOG', () => {
  it('build番号が重複しない', () => {
    const builds = CHANGELOG.map((e) => e.build)
    expect(new Set(builds).size).toBe(builds.length)
  })

  it('各エントリが空でないitemsを持つ', () => {
    for (const entry of CHANGELOG) {
      expect(entry.items.length).toBeGreaterThan(0)
    }
  })
})
