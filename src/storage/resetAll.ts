import { Storage, isDemoNamespace } from './asyncStorage'
import { cancelAllScheduledNotifications } from '../notifications/notifier'
import { clearAllCookies } from './cookies'

/**
 * すべてのアプリデータを消去する（設定・時間割・課題・掲示・同意記録・予約通知・
 * WebViewのCookie＝LETUS / CLASS のログイン状態）。
 * 実行後はアプリを再起動すると初回状態（規約同意）から始まり、SSOログインもやり直しになる。
 * 破壊的操作なので呼び出し側で二段階の確認を必須とする。
 *
 * Cookie消去は端末譲渡・共有の対策（監査M-3）。これが無いと、消去後に次の利用者が
 * 起動しただけで前の利用者のLETUS / CLASS に入れてしまう。
 */
export async function resetAllData(): Promise<void> {
  // デモ中はデモ名前空間だけを消す。設定画面はデモ中も到達可能で、ここで
  // AsyncStorage.clear() を通すと**実ユーザーの全データと予約通知を巻き添えに消す**。
  // 通知のキャンセルもCookieの消去もしない（実ユーザーの出席アラーム・課題リマインダを
  // 落とさない／実ユーザーのログイン状態を巻き添えに解除しない）。
  if (isDemoNamespace()) {
    await Storage.clearDemoNamespace()
    return
  }
  // 1) 予約済みローカル通知を全キャンセル（AsyncStorage消去後に古い予約が復活しないよう先に消す）。
  // notifier 経由で呼ぶこと。expo-notifications を直接 import すると Expo Go では
  // モジュール評価時に throw して起動不能になる（notifier.ts 冒頭とラチェットテスト参照）。
  try {
    await cancelAllScheduledNotifications()
  } catch {
    /* 通知モジュール未搭載環境では no-op */
  }
  // 2) Cookie（SSOログイン状態）を消去。cookies.ts 経由で呼ぶこと（同上の理由で遅延ロード）。
  // **失敗しても 3) は必ず実行する**。ここで throw を素通しすると「通知だけ消えて
  // データは残った」中途半端な状態でリセットが終わる。
  try {
    await clearAllCookies()
  } catch {
    /* Cookieモジュール未搭載環境では no-op */
  }
  // 3) AsyncStorage を全消去。
  await Storage.clearAll()
}
