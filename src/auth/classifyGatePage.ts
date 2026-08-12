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
  /** CLASSの定時システムメンテナンス画面（毎日2:00〜4:00。この間はログインもできない） */
  hasMaintenance?: boolean
  url?: string
}

export type GateVerdict = 'authed' | 'needsLogin' | 'stale' | 'stray' | 'pending' | 'maintenance'

const SSO_LOGIN_URL_RE = /login\.microsoftonline\.com|login\.live\.com|login\.microsoft\.com/i

/** SSO（Microsoft）ログインページのURLか。初画面はパスワード欄が無いためURLで判定する。 */
export function isSsoLoginUrl(url?: string): boolean {
  return SSO_LOGIN_URL_RE.test(url ?? '')
}

/**
 * needsLogin の根拠が「SSOのURLに居る」だけ（＝**推測**）か、パスワード欄が実在する（＝**確定**）か。
 *
 * 起動直後は大学のセッションCookie（Expires無し）が消えているので、probe は必ず SSO を経由する。
 * IdP 側のCookieが生きていればこの経由はユーザー操作なしで自動完走して authed に戻るが、
 * classifyGatePage は URL だけで needsLogin を返す（初画面にパスワード欄が無いためURL判定が要る）。
 * つまり **needsLogin には「本当に要ログイン」と「通過中なだけ」が混ざる**。両者は同期的には
 * 区別できない（待って結果を見るしかない）ので、区別できる材料＝パスワード欄の実在だけを切り出す。
 *
 * 呼び出し側（LoginGate）はこれが true のときだけログインUIの描画を猶予し、false なら即描画する。
 * 判定自体（classifyGatePage の戻り値）は変えない＝認証フローの挙動は不変。
 */
export function isSpeculativeLogin(s: GatePageSignal): boolean {
  if (s.hasPasswordInput) return false
  return isSsoLoginUrl(s.url)
}

/**
 * ログインUIの描画を猶予してよいか。**推測であること＋遷移元がブート画面を既に出していること**の両方。
 *
 * 猶予中はブート画面を出しっぱなしにして「一瞬のログイン画面」を隠すが、ブート画面が**外れている**
 * 状態から猶予に入ると、オーバーレイごと再マウントして4秒の起動イントロを頭から再生し、1.5秒で
 * 切ることになる（見た目の退行）。ブート画面が外れているのは firstRun（スライド表示中）と
 * connError（接続エラーカード表示中）の2つ。とくに connError のカードはデモ導線を載せているので、
 * ここを1.5秒隠すのは審査（2.1）の生命線を隠すことと同じ。
 *
 * requireLogin() が復帰時に bootMode='warm' にしているのと同じ趣旨＝
 * 「戻ってきた起動画面でイントロを再生し直さない」という既存の不変条件をこの猶予も守る。
 */
export function canDeferLoginUi(s: GatePageSignal, fromState: string): boolean {
  if (!isSpeculativeLogin(s)) return false
  return fromState === 'loading' || fromState === 'checking' || fromState === 'needsLogin'
}

export function classifyGatePage(s: GatePageSignal): GateVerdict {
  if (s.hasSsoStale) return 'stale'
  if (s.hasPasswordInput) return 'needsLogin'
  if (isSsoLoginUrl(s.url)) return 'needsLogin'
  // SSOフロー混線などでLETUS側に着地したら、CLASSのprobeへ誘導し直す
  if (/letus\.ed\.tus\.ac\.jp/i.test(s.url ?? '')) return 'stray'
  // 出欠管理メニュー、またはログアウトリンク（＝ログイン済みの普遍シグナル）で authed。
  if (s.hasClassMenu || s.hasLogout) return 'authed'
  // 定時メンテナンス画面はログインもできないため、pendingで詰まらせず専用扱いにする。
  if (s.hasMaintenance) return 'maintenance'
  return 'pending'
}
