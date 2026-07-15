import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import CookieManager from '@react-native-cookies/cookies'

/**
 * すべてのアプリデータを消去する（設定・時間割・課題・掲示・同意記録・LETUS/CLASSログインCookie）。
 * 実行後はアプリを再起動すると初回状態（規約同意→ログイン）から始まる。
 * 破壊的操作なので呼び出し側で二段階の確認を必須とする。
 *
 * Cookie消去はネイティブモジュール（@react-native-cookies/cookies）依存。未リンク環境（Expo Go・
 * 当該モジュールを含まない旧ビルド）では clearAll が例外になるため握りつぶす（他の消去は続行する）。
 */
export async function resetAllData(): Promise<void> {
  // 1) 予約済みローカル通知を全キャンセル（AsyncStorage消去後に古い予約が復活しないよう先に消す）。
  try {
    await Notifications.cancelAllScheduledNotificationsAsync()
  } catch {
    /* Expo Go 等では no-op */
  }
  // 2) WebViewのCookie（SSOログイン状態）を消去。iOSは WebKit ストアも対象にするため true。
  try {
    await CookieManager.clearAll(true)
  } catch {
    /* ネイティブ未リンク環境ではスキップ（次回ネイティブビルドで有効） */
  }
  // 3) AsyncStorage を全消去（最後＝上の処理が参照し得る設定を先に使い切ってから消す）。
  await AsyncStorage.clear()
}
