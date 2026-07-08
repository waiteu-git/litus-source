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
  /** ログアウトリンクの有無。ログイン済みの普遍シグナル（出欠管理メニューが無いポータルでも成立） */
  hasLogout?: boolean
  /** IdPの「過去のリクエスト」エラーページ（SAMLリプレイ拒否）。キャッシュ破棄して再試行が必要 */
  hasSsoStale?: boolean
  url?: string
}

export type GateVerdict = 'authed' | 'needsLogin' | 'stale' | 'stray' | 'pending'

const SSO_LOGIN_URL_RE = /login\.microsoftonline\.com|login\.live\.com|login\.microsoft\.com/i

/** SSO（Microsoft）ログインページのURLか。初画面はパスワード欄が無いためURLで判定する。 */
export function isSsoLoginUrl(url?: string): boolean {
  return SSO_LOGIN_URL_RE.test(url ?? '')
}

export function classifyGatePage(s: GatePageSignal): GateVerdict {
  if (s.hasSsoStale) return 'stale'
  if (s.hasPasswordInput) return 'needsLogin'
  if (isSsoLoginUrl(s.url)) return 'needsLogin'
  // SSOフロー混線などでLETUS側に着地したら、CLASSのprobeへ誘導し直す
  if (/letus\.ed\.tus\.ac\.jp/i.test(s.url ?? '')) return 'stray'
  // 出欠管理メニュー、またはログアウトリンク（＝ログイン済みの普遍シグナル）で authed。
  if (s.hasClassMenu || s.hasLogout) return 'authed'
  return 'pending'
}
