import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'

/**
 * WebViewのCookie（SSOログイン状態）を消去する。ネイティブモジュール依存。
 *
 * @react-native-cookies/cookies は **import時に** invariant でネイティブモジュールの存在を検査し、
 * 未リンク環境（Expo Go・当該モジュールを含まない旧ビルド）では import 自体が例外になる。
 * そのため静的 import は使わず、呼び出し時に require して try/catch で隔離する
 * （静的 import だと本ファイルを読み込む設定画面ごとクラッシュする）。
 */
async function clearWebViewCookies(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const CookieManager = require('@react-native-cookies/cookies') as {
      clearAll: (useWebKit?: boolean) => Promise<boolean>
    }
    // iOS は WebKit ストアも対象にするため true。
    await CookieManager.clearAll(true)
  } catch {
    /* ネイティブ未リンク環境ではスキップ（次回ネイティブビルドで有効） */
  }
}

/**
 * すべてのアプリデータを消去する（設定・時間割・課題・掲示・同意記録・LETUS/CLASSログインCookie）。
 * 実行後はアプリを再起動すると初回状態（規約同意→ログイン）から始まる。
 * 破壊的操作なので呼び出し側で二段階の確認を必須とする。
 */
export async function resetAllData(): Promise<void> {
  // 1) 予約済みローカル通知を全キャンセル（AsyncStorage消去後に古い予約が復活しないよう先に消す）。
  try {
    await Notifications.cancelAllScheduledNotificationsAsync()
  } catch {
    /* Expo Go 等では no-op */
  }
  // 2) WebViewのCookie（SSOログイン状態）を消去（未リンク環境では内部でスキップ）。
  await clearWebViewCookies()
  // 3) AsyncStorage を全消去（最後＝上の処理が参照し得る設定を先に使い切ってから消す）。
  await AsyncStorage.clear()
}
