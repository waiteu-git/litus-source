import { Storage } from './asyncStorage'
import { cancelAllScheduledNotifications } from '../notifications/notifier'

/**
 * すべてのアプリデータを消去する（設定・時間割・課題・掲示・同意記録・予約通知）。
 * 実行後はアプリを再起動すると初回状態（規約同意）から始まる。
 * 破壊的操作なので呼び出し側で二段階の確認を必須とする。
 *
 * WebViewのCookie（SSOログイン状態）消去は現状**含めない**。唯一の手段だった
 * @react-native-cookies/cookies は android/build.gradle が jcenter() を使い現行Gradleでビルドが
 * 通らなかったため撤去した。ログアウトまで含める場合はビルド互換のある後継
 * （@preeternal/react-native-cookie-manager 等）を検討する（docs/apk-build.md）。
 */
export async function resetAllData(): Promise<void> {
  // 1) 予約済みローカル通知を全キャンセル（AsyncStorage消去後に古い予約が復活しないよう先に消す）。
  // notifier 経由で呼ぶこと。expo-notifications を直接 import すると Expo Go では
  // モジュール評価時に throw して起動不能になる（notifier.ts 冒頭とラチェットテスト参照）。
  try {
    await cancelAllScheduledNotifications()
  } catch {
    /* 通知モジュール未搭載環境では no-op */
  }
  // 2) AsyncStorage を全消去。
  await Storage.clearAll()
}
