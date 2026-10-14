import { Linking } from 'react-native'
import { LITUS_SITE_URL } from '../health/notice'

/**
 * リタスのサイトを外部ブラウザで開く（停止画面の脱出リンクとお知らせ帯の共通処理）。
 * 失敗しても握りつぶす: ここで throw すると、ただでさえ止まっている画面が
 * さらにクラッシュする。開けない端末では何も起きないに留める。
 */
export function openLitusSite(): void {
  // 未設定のビルドでは入口自体を出さない（呼び出し側が LITUS_SITE_URL で分岐）。ここは念のための塞ぎ。
  if (LITUS_SITE_URL === null) return
  Linking.openURL(LITUS_SITE_URL).catch(() => undefined)
}
