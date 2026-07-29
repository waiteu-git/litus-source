import { Linking } from 'react-native'
import { LITUS_SITE_URL } from '../health/notice'

/**
 * リタスのサイトを外部ブラウザで開く（停止画面の脱出リンクとお知らせ帯の共通処理）。
 * 失敗しても握りつぶす: ここで throw すると、ただでさえ止まっている画面が
 * さらにクラッシュする。開けない端末では何も起きないに留める。
 */
export function openLitusSite(): void {
  Linking.openURL(LITUS_SITE_URL).catch(() => undefined)
}
