/**
 * iOS で「アプリ内の WebView ごとに Cookie 入れ物が分かれてしまう」のを防ぐ矯正。
 *
 * ## 何が起きていたか（build 204・iPhone 14 / iOS 26.6 で実機再現）
 * ログインした WebView だけが SSO セッションを持ち、後から立つ収集用 WebView は
 * 「ログアウトしています」になる。時間割だけ動いていたのは、LoginGate が **自分の**
 * WebView に収集 JS を注入していて同じ WebView 内で完結していたから。
 *
 * ## 真因（react-native-webview 13.16.1 / apple/RNCWebViewImpl.m）
 * ```objc
 * if (_incognito) { ...nonPersistentDataStore... }
 * else if (_cacheEnabled) { ...defaultDataStore... }   // ← 既定はこちら
 * ...
 * if (_sharedCookiesEnabled) {
 *   if (!_incognito && !_cacheEnabled) {
 *     wkWebViewConfig.websiteDataStore = [WKWebsiteDataStore nonPersistentDataStore];
 *   }
 * }
 * ```
 * `nonPersistentDataStore` は **呼ぶたびに新しい使い捨てストアを返す**。設定は WebView
 * 1個ごとに作られるので、`sharedCookiesEnabled` かつ `cacheEnabled={false}` の WebView は
 * それぞれ専用の Cookie 入れ物を持つ＝互いに見えない。`sharedCookiesEnabled` の設定漏れでは
 * なく、`cacheEnabled={false}` の側が入れ物を割っていた。
 *
 * NSHTTPCookieStorage 経由の橋渡し（`cookiesDidChangeInCookieStore:`）は実装として存在するが、
 * WKHTTPCookieStore のオブザーバは Set-Cookie ヘッダ由来の変更で発火しないことがあり当てにできない。
 * **入れ物を1つに揃えれば Cookie を運ぶ必要自体が消える**ので、橋渡しは直さずストアを揃える。
 *
 * ## なぜ iOS でだけ cacheEnabled を潰してよいか
 * iOS 実装の `cacheEnabled` は **データストアの選択以外に何もしていない**（RNCWebViewImpl.m に
 * cachePolicy / NSURLCache の分岐は存在しない）。つまり iOS では元から HTTP キャッシュを
 * 無効化できておらず、`cacheEnabled={false}` の実効は「Cookie 入れ物を割る」だけだった。
 * 握り潰しても失われる機能はない。SAML 302 の再生防止は LoginGate の URL キャッシュバスター
 * （`?litus=${nonce}`）が担っており、そちらは無傷。
 *
 * Android の `cacheEnabled` は `WebSettings.cacheMode`（LOAD_NO_CACHE）を触る本物のキャッシュ
 * 設定で、Cookie は `CookieManager` がプロセス全体で共有する。**Android は一切変えない。**
 *
 * ⚠ここで直すのは「同じセッションの中でアプリ自身の WebView が共有できていない」不具合だけ。
 * 大学がセッションスコープで出している Cookie の期限を書き換える等の延命は **していない**。
 */

/** `Platform.OS` のうち、この矯正が必要なもの。 */
const NEEDS_SHARED_JAR = 'ios'

/**
 * ネイティブへ渡す `cacheEnabled` を決める。
 *
 * iOS は常に `true`（＝`defaultDataStore` を選ばせて全 WebView で1つの Cookie 入れ物を共有）。
 * それ以外のプラットフォームは呼び出し側の指定をそのまま通す。
 */
export function resolveCacheEnabled(
  requested: boolean | undefined,
  os: string,
): boolean | undefined {
  if (os === NEEDS_SHARED_JAR) return true
  return requested
}
