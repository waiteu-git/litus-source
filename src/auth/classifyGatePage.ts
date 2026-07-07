/**
 * 起動ゲートのprobe（ShibbolethAuthServlet直開き）の到達先を判定する（純粋）。
 *
 * - ポータル（出欠管理メニュー）到達 = ログイン済み
 * - パスワード欄 or SSOログインURL = 要ログイン。TUSのSSOはMicrosoftで、初画面は
 *   メールアドレス入力のみ（パスワード欄が無い）ため URL でも判定する
 * - 入口スプラッシュは**未ログインでも表示される公開静的ページ**なので authed の根拠に
 *   しない（旧LoginGateの誤ヒューリスティック。初回ユーザーがログイン画面に到達できない
 *   実機バグの真因だった）
 */
export interface GatePageSignal {
  hasPasswordInput: boolean
  hasClassMenu: boolean
  hasEnterSplash: boolean
  url?: string
}

export type GateVerdict = 'authed' | 'needsLogin' | 'pending'

const SSO_LOGIN_URL_RE = /login\.microsoftonline\.com|login\.live\.com|login\.microsoft\.com/i

export function classifyGatePage(s: GatePageSignal): GateVerdict {
  if (s.hasPasswordInput) return 'needsLogin'
  if (SSO_LOGIN_URL_RE.test(s.url ?? '')) return 'needsLogin'
  if (s.hasClassMenu) return 'authed'
  return 'pending'
}
