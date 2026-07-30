import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ラチェット: `@expo/vector-icons` のバレルimportが復活するのを防ぐ。
 *
 * **なぜ**: バレル（`@expo/vector-icons` の `main`＝`build/IconsLazy.js`）は名前付きexportこそ
 * getter で遅延させているが、その getter が参照する `require('./AntDesign')` 等**19セット分が
 * モジュール先頭に並んでいる**。Metro は静的に辿るので、1セットしか使っていなくても
 * **19本の .ttf が全部バンドルされる**（2026-07-30実測: フォント22本→4本・
 * 3,687,116 bytes ぶんの .ttf と 429,482 bytes ぶんのバンドル＝グリフマップが落ちた）。
 * フォントは density 分割の対象外なので、この重さは全端末のダウンロードサイズに丸ごと乗る。
 *
 * この欠陥は**型チェックもテストも素通りし、画面上も何も変わらない**（見えるのはAPKのサイズだけ）
 * ＝人間のレビューで気づける類ではないので機械的な歯止めを置く。
 *
 * セットを増やすときは `@expo/vector-icons/<セット名>` の個別importを使う
 * （そのセットの .ttf だけが増える）。
 */
describe('アイコンフォントのバンドル面ラチェット', () => {
  /** バレルからの取り込み。個別import（`@expo/vector-icons/Ionicons`）は当たらない。 */
  const BARREL = /from\s+'@expo\/vector-icons'|require\('@expo\/vector-icons'\)/

  it('src配下に @expo/vector-icons のバレルimportは無い', () => {
    const offenders: string[] = []
    for (const file of listSources(join(__dirname, '..'))) {
      const rel = file.replace(/\\/g, '/').split('/src/')[1]
      if (BARREL.test(readFileSync(file, 'utf8'))) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })

  it('判定子はバレルだけを拾い個別importは拾わない', () => {
    expect(BARREL.test("import { Ionicons } from '@expo/vector-icons'")).toBe(true)
    expect(BARREL.test("const { Ionicons } = require('@expo/vector-icons')")).toBe(true)
    expect(BARREL.test("import Ionicons from '@expo/vector-icons/Ionicons'")).toBe(false)
    expect(BARREL.test("import MaterialIcons from '@expo/vector-icons/MaterialIcons'")).toBe(false)
  })
})

function listSources(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...listSources(p))
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}
