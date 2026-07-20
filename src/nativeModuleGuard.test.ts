import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { findStaticImportsOf } from './nativeModuleGuard'

const GUARDED = ['expo-notifications', 'react-native-android-widget'] as const

/**
 * 静的 import を許可するファイル（src/ からの相対パス）と、その根拠。
 * ここに足すときは「なぜ起動グラフから到達しないか」を必ず書くこと。
 */
const ALLOW: Record<string, string> = {
  // Metro のプラットフォーム別解決により Android でのみ読まれる。
  // 非 Android では registerTaskHandler.ts（no-op）が解決される。
  'widget/registerTaskHandler.android.ts': 'react-native-android-widget',
  // 描画層。import 元は registerTaskHandler.android.ts（Android専用解決）と
  // widget-task-handler.tsx（その import 元も同じ）、および updateWidget.tsx の
  // await import()（Platform ガードの内側）のみ。非 Android の起動グラフから到達しない。
  'widget/LitusWidget.tsx': 'react-native-android-widget',
}

describe('findStaticImportsOf', () => {
  it('静的 import を検出する', () => {
    expect(findStaticImportsOf("import * as N from 'expo-notifications'", GUARDED)).toEqual([
      'expo-notifications',
    ])
    expect(findStaticImportsOf("import { a } from 'react-native-android-widget'", GUARDED)).toEqual([
      'react-native-android-widget',
    ])
  })

  it('複数行にまたがる import も検出する', () => {
    const src = "import {\n  FlexWidget,\n  TextWidget,\n} from 'react-native-android-widget'"
    expect(findStaticImportsOf(src, GUARDED)).toEqual(['react-native-android-widget'])
  })

  it('副作用のみの import も検出する', () => {
    expect(findStaticImportsOf("import 'expo-notifications'", GUARDED)).toEqual([
      'expo-notifications',
    ])
  })

  it('import type は検出しない（TypeScript が消去するため）', () => {
    expect(findStaticImportsOf("import type { P } from 'react-native-android-widget'", GUARDED)).toEqual(
      [],
    )
  })

  it('await import / typeof import は検出しない', () => {
    expect(findStaticImportsOf("const N = await import('expo-notifications')", GUARDED)).toEqual([])
    expect(findStaticImportsOf("type M = typeof import('expo-notifications')", GUARDED)).toEqual([])
  })

  it('無関係なモジュールは無視する', () => {
    expect(findStaticImportsOf("import { View } from 'react-native'", GUARDED)).toEqual([])
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

/**
 * ラチェット: 「読み込んだだけで落ちる」ネイティブモジュールを、許可ファイル以外が
 * 静的 import していないこと。
 *
 * 破ると Expo Go や iOS で **起動即クラッシュ** する（画面が一切出ないので原因が分かりにくい）。
 * 追加するときは notifier.ts / registerTaskHandler.ts と同じく、遅延ロードか
 * プラットフォーム別ファイルへ逃がすこと。
 */
describe('ネイティブモジュールの静的importガード（ラチェット）', () => {
  it('許可ファイル以外は expo-notifications / react-native-android-widget を静的 import しない', () => {
    const srcDir = join(__dirname)
    if (!existsSync(srcDir)) return
    const offenders: string[] = []
    for (const file of listSources(srcDir)) {
      const rel = file.replace(/\\/g, '/').split('/src/')[1]
      const hits = findStaticImportsOf(readFileSync(file, 'utf8'), GUARDED)
      for (const hit of hits) {
        if (ALLOW[rel] === hit) continue
        offenders.push(`${rel} → ${hit}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('エントリポイント（index.ts / App.tsx）も同様', () => {
    const root = join(__dirname, '..')
    const offenders: string[] = []
    for (const name of ['index.ts', 'App.tsx']) {
      const p = join(root, name)
      if (!existsSync(p)) continue
      for (const hit of findStaticImportsOf(readFileSync(p, 'utf8'), GUARDED)) {
        offenders.push(`${name} → ${hit}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
