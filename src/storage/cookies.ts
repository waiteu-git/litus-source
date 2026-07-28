/**
 * WebViewのCookie（LETUS / CLASS のSSOログイン状態）を消す薄い端末層。
 * 全データリセット（resetAll.ts）からのみ呼ぶ。
 *
 * @preeternal/react-native-cookie-manager は `TurboModuleRegistry.getEnforcing` で
 * ネイティブ実装を取りに行くため、**ネイティブ側が無い環境ではモジュール評価時点で throw する**
 * （Expo Go / モジュール未搭載ビルド）。静的 import すると起動グラフごと落ちて画面が一切
 * 出ないので、必ずこのモジュールの遅延 import 経由で読むこと。
 * src/nativeModuleGuard.test.ts のラチェットが静的 import を禁止している。
 *
 * 旧 @react-native-cookies/cookies は android/build.gradle が jcenter() を使い現行Gradleで
 * ビルドが通らず撤去した（docs/apk-build.md の build 79）。本パッケージは google() /
 * mavenCentral() のみを使う後継。
 */
import Constants, { ExecutionEnvironment } from 'expo-constants'

/** Expo Go にはネイティブ側が無い（読み込むと getEnforcing が throw する）。 */
const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient

type CookieManagerModule = typeof import('@preeternal/react-native-cookie-manager')

let cached: CookieManagerModule | null | undefined

/** Cookieモジュールを遅延ロードする。Expo Go / 未搭載環境では読み込まず null（no-op）。 */
async function loadCookieManager(): Promise<CookieManagerModule | null> {
  if (cached !== undefined) return cached
  if (IS_EXPO_GO) {
    console.warn('Expo GoではCookieを消去できません（確認には開発ビルドが必要です）')
    cached = null
    return cached
  }
  try {
    cached = await import('@preeternal/react-native-cookie-manager')
  } catch (e) {
    console.warn('Cookieモジュールを利用できませんでした', e)
    cached = null
  }
  return cached
}

/** テスト専用。モジュールキャッシュを捨てる。 */
export function __resetCookieModuleCacheForTest(): void {
  cached = undefined
}

/**
 * 端末に残っている全Cookieを消す（＝LETUS / CLASS のログイン状態を解除する）。
 *
 * **`clearAllStores()` を使うこと。`clearAll()` ではダメ**。iOSにはCookieストアが2つあり
 * （Foundation の HTTPCookieStorage と WebKit の WKWebsiteDataStore）、`clearAll()` の既定
 * `useWebKit=false` は Foundation しか消さない＝WKWebView に入っているSSOセッションが
 * そのまま生き残る。`clearAllStores()` は両方消す。Androidはストアが1つで、どちらも
 * `removeAllCookies` + `flush` になる。
 *
 * 失敗（モジュール不在・ネイティブ例外）は握って no-op にする。**リセット全体を失敗させない**
 * ため。Cookieが消せなくても AsyncStorage の消去は必ず完了させる必要がある
 * （途中で止めると「一部だけ消えた」状態でユーザーが取り残される）。
 */
export async function clearAllCookies(): Promise<void> {
  const CookieManager = await loadCookieManager()
  if (!CookieManager) return
  try {
    await CookieManager.default.clearAllStores()
  } catch (e) {
    console.warn('Cookieの消去に失敗しました', e)
  }
}
