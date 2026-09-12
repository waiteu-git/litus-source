import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { findRuntimeReferencesOf } from '../nativeModuleGuard'

/**
 * 休眠ラチェット（docs/design/2026-09-12-v11-train1-NATIVE.md §7 T2）。
 *
 * expo-haptics と expo-store-review は train1 でバイナリに入れるが、JS からは参照しない。
 * - 両パッケージの JS の入口は、モジュール評価の時点で requireNativeModule を呼ぶ
 *   （expo-store-review 57.0.1 の src/ExpoStoreReview.native.ts:1-2）。参照した時点で機能の配線が始まる。
 * - 使い始めるのは F（アプリ内レビュー依頼）と触覚の設計1枚だけ。OTA が無いので、呼ぶ JS は必ず
 *   新しいバイナリと審査を通って出る。
 *
 * GUARDED（src/nativeModuleGuard.test.ts）には足さない。GUARDED の基準は「どこかの実行環境に
 * ネイティブ実体が無い」ことで、両パッケージは bundledNativeModules に載り、prebuild 後は両OSで
 * autolink されるので当たらない（設計 §4-5）。こちらは「参照ゼロ」そのものを固定する。
 *
 * ALLOW を広げるのは F と触覚の設計1枚だけ。1モジュールにつき1ファイルまで、理由を書いて1行ずつ足す
 * （nativeModuleGuard.test.ts の ALLOW と同じ書き方）。F の計画にある「import してよいファイルを
 * 1つに限るラチェット」は、この ALLOW と下の「1ファイルまで」のテストが兼ねる。
 */

/** バイナリに入れて、まだ JS から呼ばないモジュール（実物のラチェットの対象）。 */
const DORMANT = ['expo-haptics', 'expo-store-review'] as const

/**
 * 検出器の陽性・陰性の検査で使う組。DORMANT とは独立させる
 * （片方だけを外す分岐＝設計 §4-4 で DORMANT を1つにしても、検出器のテストは書き換えずに済む）。
 */
const DETECTOR_MODULES = ['expo-haptics', 'expo-store-review'] as const

/** src/ からの相対パス → 参照を許すモジュール名。NATIVE の時点では空。 */
const ALLOW: Record<string, string> = {}

const SRC = join(__dirname, '..')
const ROOT = join(__dirname, '..', '..')

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

/** src/（テストを除く）と index.ts・App.tsx の中の modules への参照を「ファイル → モジュール」で並べる。 */
function scanReferences(modules: readonly string[], allow: Record<string, string>): string[] {
  const hits: string[] = []
  for (const file of listSources(SRC)) {
    const rel = relative(SRC, file).split(sep).join('/')
    for (const mod of findRuntimeReferencesOf(readFileSync(file, 'utf8'), modules)) {
      if (allow[rel] === mod) continue
      hits.push(`${rel} → ${mod}`)
    }
  }
  for (const name of ['index.ts', 'App.tsx']) {
    const p = join(ROOT, name)
    if (!existsSync(p)) continue
    for (const mod of findRuntimeReferencesOf(readFileSync(p, 'utf8'), modules)) {
      hits.push(`${name} → ${mod}`)
    }
  }
  return hits
}

const POSITIVE: Array<[string, string[]]> = [
  ["import * as H from 'expo-haptics'", ['expo-haptics']],
  ["import 'expo-haptics'", ['expo-haptics']],
  // 型だけの名前付き import でも、宣言ごと消えるとは限らないので参照に数える
  ["import { type ImpactFeedbackStyle } from 'expo-haptics'", ['expo-haptics']],
  ["export { impactAsync } from 'expo-haptics'", ['expo-haptics']],
  ["export * from 'expo-haptics'", ['expo-haptics']],
  ["export * as H from 'expo-haptics'", ['expo-haptics']],
  ["export {\n  impactAsync,\n  selectionAsync,\n} from 'expo-haptics'", ['expo-haptics']],
  ["const S = await import('expo-store-review')", ['expo-store-review']],
  ["import('expo-store-review').then((m) => m.requestReview())", ['expo-store-review']],
  ["const S = require('expo-store-review')", ['expo-store-review']],
  ['import StoreReview from "expo-store-review/build/StoreReview"', ['expo-store-review']],
  ["const S = await import('expo-store-review')\nimport * as H from 'expo-haptics'", ['expo-haptics', 'expo-store-review']],
]

const NEGATIVE: string[] = [
  "import type { ImpactFeedbackStyle } from 'expo-haptics'",
  "export type { ImpactFeedbackStyle } from 'expo-haptics'",
  "type M = typeof import('expo-store-review')",
  "import X from 'expo-store-reviewer'",
  "const S = await import('expo-store-reviewer')",
  '// expo-haptics は F の設計1枚で使い始める',
  '/* expo-store-review は 57.0.1 に固定している */',
  "const name = 'expo-haptics'",
  "x.import('expo-haptics')",
  "require.resolve('expo-haptics')",
]

describe('findRuntimeReferencesOf', () => {
  it.each(POSITIVE)('陽性: %s', (src, expected) => {
    expect(findRuntimeReferencesOf(src, DETECTOR_MODULES)).toEqual(expected)
  })

  it.each(NEGATIVE)('陰性: %s', (src) => {
    expect(findRuntimeReferencesOf(src, DETECTOR_MODULES)).toEqual([])
  })
})

describe('休眠ラチェット（実物の src/・index.ts・App.tsx）', () => {
  it('計器の陽性対照: 既に参照がある react-native-android-widget の静的 import と await import を実物から拾う', () => {
    // LitusWidget.tsx:7 は静的 import、updateWidget.tsx:31 は await import。
    // どちらかが消えたらこの対照を差し替える（実物を読めていることの証拠なので、消さずに別の実例へ移す）。
    expect(scanReferences(['react-native-android-widget'], {})).toEqual(
      expect.arrayContaining([
        'widget/LitusWidget.tsx → react-native-android-widget',
        'widget/updateWidget.tsx → react-native-android-widget',
      ]),
    )
  })

  it('許可ファイル以外は DORMANT のモジュールを参照しない', () => {
    expect(scanReferences(DORMANT, ALLOW)).toEqual([])
  })

  it('許可は1モジュールにつき1ファイルまで', () => {
    for (const mod of DORMANT) {
      expect(Object.values(ALLOW).filter((m) => m === mod).length).toBeLessThanOrEqual(1)
    }
  })
})
