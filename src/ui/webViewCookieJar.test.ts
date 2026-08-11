import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveCacheEnabled } from './webViewCookieJar'

const guardSource = readFileSync(join(__dirname, 'GuardedWebView.tsx'), 'utf8')

/**
 * iOS の Cookie ジャー分裂バグ（build 204 で実機再現）の回帰テスト。
 *
 * react-native-webview 13.16.1 の RNCWebViewImpl.m は、`sharedCookiesEnabled` かつ
 * `cacheEnabled=false` かつ非 incognito のとき **WebView 1個ごとに**
 * `[WKWebsiteDataStore nonPersistentDataStore]`（＝毎回新しい使い捨てストア）を割り当てる。
 * その結果、ログインした WebView と後から立つ収集 WebView が別々の Cookie 入れ物を持ち、
 * SSO セッションが共有されない。Android の CookieManager はプロセス共有なので起きない。
 */
describe('iOS の Cookie ジャーを分裂させない', () => {
  it('iOS では cacheEnabled=false を握り潰して true にする', () => {
    // false のままネイティブへ渡すと nonPersistentDataStore（使い捨て・WebView 専用）が選ばれる。
    expect(resolveCacheEnabled(false, 'ios')).toBe(true)
  })

  it('iOS では未指定でも true に確定させる（既定に依存しない）', () => {
    expect(resolveCacheEnabled(undefined, 'ios')).toBe(true)
    expect(resolveCacheEnabled(true, 'ios')).toBe(true)
  })

  it('Android では呼び出し側の指定をそのまま通す（LOAD_NO_CACHE は Cookie と無関係）', () => {
    // Android の cacheEnabled は WebSettings.cacheMode だけを触る本物のキャッシュ設定。
    // Cookie ジャーとは無関係なので、iOS の都合で Android の挙動を変えない。
    expect(resolveCacheEnabled(false, 'android')).toBe(false)
    expect(resolveCacheEnabled(true, 'android')).toBe(true)
    expect(resolveCacheEnabled(undefined, 'android')).toBe(undefined)
  })
})

/**
 * ラチェット: 矯正は「生成点で・呼び出し側の指定より後」に効かなければ意味がない。
 * props の展開より前に置くと `{...props}` の cacheEnabled={false} に上書きされて無音で復活する。
 */
describe('GuardedWebView が矯正を適用している（ラチェット）', () => {
  it('resolveCacheEnabled を使っている', () => {
    expect(guardSource).toContain('resolveCacheEnabled')
  })

  it('cacheEnabled の指定が {...props} より後ろにある', () => {
    const spread = guardSource.indexOf('{...props}')
    const fix = guardSource.indexOf('cacheEnabled={resolveCacheEnabled(')
    expect(spread).toBeGreaterThan(-1)
    expect(fix).toBeGreaterThan(spread)
  })

  it('デモ判定が WebView を返すより前にある（通信ゼロの担保を崩さない）', () => {
    // `<RNWebView` は forwardRef<RNWebView, …> の型引数にも出るので、JSX 本体だけに現れる
    // `ref={ref}` を描画位置の目印にする。
    const demo = guardSource.indexOf('if (isDemoNamespace()) return null')
    const render = guardSource.indexOf('ref={ref}')
    expect(demo).toBeGreaterThan(-1)
    expect(render).toBeGreaterThan(-1)
    expect(demo).toBeLessThan(render)
  })

  it('Cookie の橋渡しコードを持ち込んでいない（デモ中に走りうる処理を増やさない）', () => {
    // 今回の修正はストアを1つに揃えるだけで、Cookie を読み書きする実行時コードを一切足さない。
    // CookieManager を呼ぶ実装に差し替えられたらこのテストで気付く。
    expect(guardSource).not.toContain('cookie-manager')
    expect(guardSource).not.toContain('CookieManager')
  })
})
