import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { importerSpecifierOf, isExactVersion, lockPackageVersionsOf, pinViolations } from './nativeDepsPin'

const ROOT = join(__dirname, '..', '..')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const lock = readFileSync(join(ROOT, 'pnpm-lock.yaml'), 'utf8')

/**
 * 固定ラチェット（docs/design/2026-09-12-v11-train1-NATIVE.md §7 T1）。
 * expo-haptics と expo-store-review を、package.json に範囲記号なしの 57.0.1 で書き、
 * lockfile もその1版だけにする（オーナー承認 2026-09-12・設計 §9-1 と §9-2）。
 *
 * 固定の理由（設計 §3）
 * - expo-store-review 57.0.2 以降の iOS は、expo-modules-core 57.0.11 で入った SceneGeometry を呼ぶ。
 *   リポの expo-modules-core は 57.0.7（iOS は precompiled の xcframework）で、この型が無い。
 *   範囲指定（~57.0.1）だと pnpm は範囲の最新を選び、iOS がコンパイルできない公算が大きい。
 * - expo-haptics に SceneGeometry の罠は無い。それでも固定するのは、範囲指定だと lockfile を
 *   作り直すだけで package.json の差分ゼロのままネイティブが動くから（range の罠）。Android は
 *   組み込み済み AAR が使われるので、215 で動いている AAR と同じ世代（07-15 公開・gitHead b9503d06）の
 *   57.0.1 に置く。
 * - npx expo install <pkg>・npx expo install --fix・pnpm add は範囲指定を書きうる。書かれたらここで落ちる。
 *
 * 動かす条件（設計 §4-7・日付でなく条件）
 * expo-modules-core が 57.0.11 以上に上がる版（＝Expo パッチ追随をした版・設計 §9-6）までは、
 * 2つとも 57.0.1 から動かさない。その版で「範囲指定へ戻すか、固定のまま版を上げるか」を
 * パッチ追随の設計で決め、このテストを書き換える。下の計器の陽性対照（expo-modules-core＝57.0.7）は、
 * lockfile の作り直しで core が上がった時にも落ちるので、この条件の見張りを兼ねる
 * （expo 側の指定は ~57.0.7 で、押さえているのは lockfile だけ）。
 */
const PINNED = {
  'expo-haptics': '57.0.1',
  'expo-store-review': '57.0.1',
} as const

/**
 * 合成入力の検査で使う固定の組。実物の PINNED とは独立させる
 * （片方だけを外す分岐＝設計 §4-4 でも、合成入力のテストは書き換えずに済む）。
 */
const SYNTH_PINS = {
  'expo-haptics': '57.0.1',
  'expo-store-review': '57.0.1',
} as const

/** 合成 lockfile（pnpm lockfileVersion 9 の、この検査が読む部分だけ）。 */
function syntheticLock(entries: Array<{ name: string; specifier: string; versions: string[] }>): string {
  return [
    "lockfileVersion: '9.0'",
    '',
    'importers:',
    '',
    '  .:',
    '    dependencies:',
    ...entries.flatMap((e) => [
      `      ${e.name}:`,
      `        specifier: ${e.specifier}`,
      `        version: ${e.versions[0]}(expo@57.0.8)`,
    ]),
    '',
    'packages:',
    '',
    ...entries.flatMap((e) => e.versions.flatMap((v) => [`  ${e.name}@${v}:`, '    resolution: {integrity: sha512-x}', ''])),
    'snapshots:',
    '',
    ...entries.flatMap((e) => e.versions.flatMap((v) => [`  ${e.name}@${v}(expo@57.0.8):`, '    dependencies:', ''])),
  ].join('\n')
}

describe('isExactVersion', () => {
  it.each(['~57.0.1', '^57.0.1', '>=57.0.1', '57.0.x', '*', '57.0', 'latest', '57.0.1 || 57.0.2'])(
    '陰性: %s は固定ではない',
    (spec) => {
      expect(isExactVersion(spec)).toBe(false)
    },
  )

  it('陽性: 57.0.1 は固定', () => {
    expect(isExactVersion('57.0.1')).toBe(true)
  })
})

describe('lockfile の読み取り（計器）', () => {
  it('陽性対照: 実物の lockfile で expo-modules-core は 57.0.7 の1件だけ（§4-7 の見張りを兼ねる）', () => {
    expect(lockPackageVersionsOf(lock, 'expo-modules-core')).toEqual(['57.0.7'])
  })

  it('陽性対照: 実物の lockfile で完全固定と範囲指定の specifier を読み分ける', () => {
    expect(importerSpecifierOf(lock, 'react-native-webview')).toBe('13.16.1')
    expect(importerSpecifierOf(lock, 'expo-linear-gradient')).toBe('~57.0.1')
  })

  it('陰性対照: 名前が前方一致するだけの別パッケージは数えない', () => {
    const l = syntheticLock([{ name: 'expo-store-reviewer', specifier: '1.0.0', versions: ['1.0.0'] }])
    expect(lockPackageVersionsOf(l, 'expo-store-review')).toEqual([])
    expect(importerSpecifierOf(l, 'expo-store-review')).toBeNull()
  })

  it('陰性対照: snapshots にしか無い版は packages の版に数えない', () => {
    const l = ['packages:', '', 'snapshots:', '', '  expo-store-review@57.0.1(expo@57.0.8):', '    dependencies:', ''].join('\n')
    expect(lockPackageVersionsOf(l, 'expo-store-review')).toEqual([])
  })
})

describe('pinViolations（合成入力）', () => {
  const pinnedPkg = { dependencies: { 'expo-haptics': '57.0.1', 'expo-store-review': '57.0.1' } }

  it('陽性: 両方が 57.0.1 に固定され、lockfile も1版だけなら違反なし', () => {
    const l = syntheticLock([
      { name: 'expo-haptics', specifier: '57.0.1', versions: ['57.0.1'] },
      { name: 'expo-store-review', specifier: '57.0.1', versions: ['57.0.1'] },
    ])
    expect(pinViolations(pinnedPkg, l, SYNTH_PINS)).toEqual([])
  })

  it('陰性: expo install が ~57.0.1 に書き戻し、pnpm が 57.0.3 を選んだ世界を捕まえる', () => {
    const l = syntheticLock([
      { name: 'expo-haptics', specifier: '57.0.1', versions: ['57.0.1'] },
      { name: 'expo-store-review', specifier: '~57.0.1', versions: ['57.0.3'] },
    ])
    const ranged = { dependencies: { 'expo-haptics': '57.0.1', 'expo-store-review': '~57.0.1' } }
    expect(pinViolations(ranged, l, SYNTH_PINS)).toEqual([
      'expo-store-review: package.json が範囲指定 ~57.0.1（固定値 57.0.1 を範囲記号なしで書く）',
      'expo-store-review: lockfile の specifier が ~57.0.1（固定値は 57.0.1）',
      'expo-store-review: lockfile の解決版が [57.0.3]（固定値 57.0.1 の1件だけのはず）',
    ])
  })

  it('陰性: package.json は固定のまま lockfile に別の版が並んだ世界を捕まえる', () => {
    const l = syntheticLock([
      { name: 'expo-haptics', specifier: '57.0.1', versions: ['57.0.1', '57.0.2'] },
      { name: 'expo-store-review', specifier: '57.0.1', versions: ['57.0.1'] },
    ])
    expect(pinViolations(pinnedPkg, l, SYNTH_PINS)).toEqual([
      'expo-haptics: lockfile の解決版が [57.0.1, 57.0.2]（固定値 57.0.1 の1件だけのはず）',
    ])
  })

  it('陰性: 未導入を捕まえる', () => {
    expect(pinViolations({ dependencies: {} }, syntheticLock([]), SYNTH_PINS)).toEqual([
      'expo-haptics: package.json の dependencies に無い',
      'expo-haptics: lockfile の specifier が 無し（固定値は 57.0.1）',
      'expo-haptics: lockfile の解決版が []（固定値 57.0.1 の1件だけのはず）',
      'expo-store-review: package.json の dependencies に無い',
      'expo-store-review: lockfile の specifier が 無し（固定値は 57.0.1）',
      'expo-store-review: lockfile の解決版が []（固定値 57.0.1 の1件だけのはず）',
    ])
  })
})

describe('固定ラチェット（実物の package.json と pnpm-lock.yaml）', () => {
  it('PINNED のパッケージは範囲記号なしの版に完全固定され、lockfile もその版の1件だけ', () => {
    expect(pinViolations(pkg, lock, PINNED)).toEqual([])
  })
})
