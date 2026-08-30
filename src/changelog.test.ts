import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

describe('🔴 changelog と app.json の版が一致する', () => {
  // 2026-08-28に気づいた穴: これまで**両者を突き合わせるものが何も無かった**。
  // 「changelogは210なのにビルドは209」「版を上げたのにchangelogを書き忘れた」が
  // どちらも無言で通り、出荷して初めて分かる（アプリ内の変更履歴が実物とずれる）。
  const ROOT = join(__dirname, '..')
  const appJson = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'))

  it('先頭エントリの build が versionCode と buildNumber の両方に一致する', () => {
    const newest = CHANGELOG[0].build
    expect(appJson.expo.android.versionCode).toBe(newest)
    expect(appJson.expo.ios.buildNumber).toBe(String(newest))
  })

  it('先頭が最新の build（アプリ内「新着」がここを出すため）', () => {
    // ⚠ 全体が降順ではない＝build 69〜97 の古い区間は**昇順で並んでいる**（2026-08-28実測）。
    // 履歴の見た目より、**先頭が最新であること**が実際に効く性質なのでそこだけ縛る。
    const builds = CHANGELOG.map((e) => e.build)
    expect(CHANGELOG[0].build).toBe(Math.max(...builds))
  })

  it('同じ build が二度出てこない', () => {
    const builds = CHANGELOG.map((e) => e.build)
    expect(new Set(builds).size).toBe(builds.length)
  })
})
