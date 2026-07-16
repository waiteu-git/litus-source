/**
 * 起動ゲートの自動復帰（probe WebViewの作り直し）の上限判定（純粋・テスト可能）。
 *
 * 通信起因の失敗（ロードエラー・SAML stale の反復）は一定回数まで作り直して再試行し、
 * それを超えたら **CLASSログイン画面ではなく** 接続エラー表示（connError）に落とす。
 * 「通信不良なだけなのにログイン画面が出る」のを防ぐため、ここを needsLogin にしない。
 */
export const RECOVER_LIMIT = 3

export type RecoverOutcome = 'retry' | 'connError'

export function recoverOutcome(tries: number): RecoverOutcome {
  return tries >= RECOVER_LIMIT ? 'connError' : 'retry'
}
