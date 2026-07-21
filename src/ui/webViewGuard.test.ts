import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { findStaticImportsOf } from '../nativeModuleGuard'

const RN_WEBVIEW = 'react-native-webview'

/** ラッパー自身だけが react-native-webview を直接 import してよい。 */
const ALLOW = new Set(['ui/GuardedWebView.tsx'])

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
 * ラチェット: WebView の生成点を src/ui/GuardedWebView.tsx に一本化する。
 *
 * リタスの通信は事実上すべて WebView 経由。デモモードは「ネットワークに一切出ない」ことが
 * 前提だが、収集エンジンは画面からも直接マウントされる（掲示詳細を開くと本文取得エンジンが
 * 自動で立つ等）ため、呼び出し側の個別ガードでは必ず取りこぼす。実際、最初の実装では
 * App.tsx のツリー分岐と個別ガード4箇所で済ませた結果、7経路が素通りしていた。
 *
 * 直接 import を禁じておけば、新しいエンジンを足した人がガードを忘れても漏れない。
 */
describe('WebView生成点のガード（ラチェット）', () => {
  it('GuardedWebView 以外は react-native-webview を直接 import しない', () => {
    const srcDir = join(__dirname, '..')
    const offenders: string[] = []
    for (const file of listSources(srcDir)) {
      const rel = file.replace(/\\/g, '/').split('/src/')[1]
      if (ALLOW.has(rel)) continue
      if (findStaticImportsOf(readFileSync(file, 'utf8'), [RN_WEBVIEW]).length > 0) {
        offenders.push(rel)
      }
    }
    expect(offenders).toEqual([])
  })

  it('エントリポイント（index.ts / App.tsx）も同様', () => {
    const root = join(__dirname, '..', '..')
    const offenders: string[] = []
    for (const name of ['index.ts', 'App.tsx']) {
      const p = join(root, name)
      if (!existsSync(p)) continue
      if (findStaticImportsOf(readFileSync(p, 'utf8'), [RN_WEBVIEW]).length > 0) offenders.push(name)
    }
    expect(offenders).toEqual([])
  })
})
