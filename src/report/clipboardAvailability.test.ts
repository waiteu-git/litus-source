import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ラチェット: react-native コアの `Clipboard` の**実装**が消えたら赤くなる。
 *
 * **なぜ型では守れないか**: `Clipboard` は RN の型定義で `@deprecated` かつ
 * 「will be removed in a future release」と明記されている。型が残ったまま実装だけ消える
 * ——これはこのプロジェクトで実際に起きた事故と同じ形（`Constants.nativeBuildVersion` は
 * 型だけ残り実装が消えていて、tsc も test も素通りし、キルスイッチの版指定が
 * 出荷済み全ビルドで一度も効いていなかった）。
 *
 * 「本文をコピー」は `mailto:` が長さで切られた時の**唯一の逃げ道**なので、
 * 黙って壊れると報告手段そのものが失われる。`expo-clipboard` /
 * `@react-native-clipboard/clipboard` への移行が要るタイミングを、RN更新の時点で機械的に知る。
 *
 * ⚠ここが見ているのは `node_modules` の実物＝**実装の在処**であって、
 * 端末で本当にコピーできることの証明ではない（それは実機確認でしか取れない）。
 */
describe('コアClipboardの実装の在処ラチェット', () => {
  const RN = join(__dirname, '..', '..', 'node_modules', 'react-native')

  const REQUIRED = [
    // JS側の入口（`import { Clipboard } from 'react-native'` が最終的に辿る先）
    'Libraries/Components/Clipboard/Clipboard.js',
    // iOS のネイティブ実装（React/CoreModules は既定で登録される）
    'React/CoreModules/RCTClipboard.mm',
    // Android のネイティブ実装
    'ReactAndroid/src/main/java/com/facebook/react/modules/clipboard/ClipboardModule.kt',
  ] as const

  it('JS入口とネイティブ実装が両OSぶん存在する', () => {
    const missing = REQUIRED.filter((p) => !existsSync(join(RN, p)))
    expect(missing).toEqual([])
  })

  it('Androidの既定パッケージに ClipboardModule が登録されている', () => {
    // 実装ファイルが在っても、既定パッケージから外れれば端末では使えない。
    const shell = join(RN, 'ReactAndroid/src/main/java/com/facebook/react/shell/MainReactPackage.kt')
    expect(existsSync(shell)).toBe(true)
    expect(readFileSync(shell, 'utf8')).toContain('ClipboardModule')
  })

  it('react-native が Clipboard を index から公開している', () => {
    const index = join(RN, 'index.js')
    expect(readFileSync(index, 'utf8')).toContain('get Clipboard()')
  })
})
