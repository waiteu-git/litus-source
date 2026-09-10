import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CHANGELOG,
  formatChangelogHeading,
  getRecentChangelog,
  sortChangelogDesc,
  type ChangelogEntry,
} from './changelog'

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

describe('formatChangelogHeading', () => {
  // 表示は React なので vitest から見られない。**見出しを組む純粋関数**をここで縛る
  // （設計 `docs/design/2026-09-05-changelog-by-version.md` §4-Q5）。
  it('version があれば v{版}（日付）を返す', () => {
    expect(formatChangelogHeading({ build: 212, version: '1.1.0', date: '2026/09/05', items: ['a'] })).toBe(
      'v1.1.0（2026/09/05）',
    )
  })

  it('version が無いエントリは従来どおり build N（日付）のまま', () => {
    expect(formatChangelogHeading({ build: 210, date: '2026/08/28', items: ['a'] })).toBe('build 210（2026/08/28）')
  })

  it('version が空文字のときも build 表示へ倒す（v（日付）という空の見出しを出さない）', () => {
    expect(formatChangelogHeading({ build: 210, version: '', date: '2026/08/28', items: ['a'] })).toBe(
      'build 210（2026/08/28）',
    )
  })

  // 🔴 版単位表示は 212 が1件目（版は 1.0.1）。⚠ 既存49件も中身は v1.0.0 のビルドだが、
  // 遡及で version を付けない（付けても情報が増えず、畳むと1エントリに約400項目入って
  // 読めなくなる＝設計 §5）。
  //
  // ⚠**このテストで先頭の build 番号を固定しない。** 以前は `toBe(212)` と書いており、
  // 213 を切った瞬間に「実装は正しいのにテストだけ落ちる」形になった（2026-09-10 に実際に踏んだ）。
  // 守りたいのは「先頭は版表示になる」という性質であって、特定の番号ではない。
  it('CHANGELOG の先頭は必ず版の見出しになる（番号は固定しない）', () => {
    const head = CHANGELOG[0]
    expect(head.version, '新しいエントリには version を付ける').toBeTruthy()
    expect(formatChangelogHeading(head)).toBe(`v${head.version}（${head.date}）`)
  })

  // 版表示の起点である 212 は歴史上の事実なので固定してよい（動かない）。
  it('212 は v1.0.1 の見出しのまま', () => {
    const e = CHANGELOG.find((x) => x.build === 212)
    expect(e).toBeDefined()
    expect(formatChangelogHeading(e!)).toBe('v1.0.1（2026/09/05）')
  })
})

describe('🔴 CHANGELOG の件数ラチェット', () => {
  // 版単位表示への移行（212）で**既存エントリを畳もうとする誘惑**が常にある。
  // 49件を「v1.0.0」1件へまとめると1エントリに約400項目が入って読めなくなるため、
  // 任意欄 `version` を足すだけにして既存は無変更で残す設計にした。
  // ⚠ ここが減ったら、それは畳んだか消したかのどちらか。増やすのは自由。
  it('エントリ数が 49 を下回らない', () => {
    expect(CHANGELOG.length).toBeGreaterThanOrEqual(49)
  })

  it('version を持つのは 212 以降だけ（既存への遡及付与をしない）', () => {
    for (const entry of CHANGELOG) {
      if (entry.version !== undefined) expect(entry.build).toBeGreaterThanOrEqual(212)
    }
  })
})
