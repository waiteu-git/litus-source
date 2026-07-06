/** WebViewの現在ページから抽出したログイン状態シグナル（純粋判定用） */
export interface AuthSignal {
  /** パスワード入力欄が存在する＝SSOログインフォーム */
  hasPasswordInput: boolean
  /** ログアウトリンク（ログアウト/logout）が存在する＝ログイン済み */
  hasLogoutLink: boolean
  /** 判定補助・ログ用の現在URL（分類には未使用） */
  url?: string
}

export type AuthStatus = 'authenticated' | 'needsLogin' | 'unknown'

/**
 * ログイン状態を分類する。CLASS（JSF）/ LETUS（Moodle）双方で成立する普遍シグナルのみ使う:
 * パスワード入力欄の有無＝ログイン要否、ログアウトリンクの有無＝ログイン済み。
 * パスワード欄はログインを求められている強いシグナルのため最優先。
 * どちらも無い（読み込み中・リダイレクト途中・中間ページ）は unknown に倒し、誤って認証済み扱いしない。
 */
export function classifyAuthState(signal: AuthSignal): AuthStatus {
  if (signal.hasPasswordInput) return 'needsLogin'
  if (signal.hasLogoutLink) return 'authenticated'
  return 'unknown'
}
