/**
 * 起動ゲートの自動復帰（probe WebViewの作り直し）の判定（純粋・テスト可能）。
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

/** LoginGate の状態名（recover の対象判定に使う部分集合）。 */
export type GateStateName =
  | 'loading'
  | 'needsConsent'
  | 'firstRun'
  | 'checking'
  | 'needsLogin'
  | 'setup'
  | 'sync'
  | 'authed'
  | 'maintenance'
  | 'connError'

/**
 * recover() が触ってはいけない状態（画面を保持し、connError/checking へ移さない）。
 * - firstRun / loading: 起動直後の初期画面。
 * - needsConsent: 規約同意ゲート。probe WebView のロード失敗でこの画面を消すと、connError の
 *   「このまま開く」から**規約未同意のまま入場**できてしまう（法的ゲートのバイパス）。必ず保持する。
 */
export const RECOVER_PRESERVED: GateStateName[] = ['firstRun', 'loading', 'needsConsent']

export type RecoverPlan = 'noop' | 'toConnError' | 'retry'

/**
 * 現在状態と失敗回数から recover の行動を決める。
 * - needsLogin: 可視ログイン中＝ユーザーが認証情報を入力中。作り直すと入力が消えるので触らない。
 * - connError: 再probeは専用インターバルが駆動する。ここで作り直すと無駄なリロードが連発する。
 * - それ以外: 上限までは retry（作り直して再probe）、上限で toConnError（接続エラー表示）。
 *   ただし RECOVER_PRESERVED の画面は呼び出し側が状態を保持する（toConnError/retry でも画面は不変）。
 */
export function recoverPlan(state: GateStateName, tries: number): RecoverPlan {
  if (state === 'needsLogin' || state === 'connError') return 'noop'
  return recoverOutcome(tries) === 'connError' ? 'toConnError' : 'retry'
}

/** その状態は recover で保持される（connError/checking へ移されない）か。 */
export function isRecoverPreserved(state: GateStateName): boolean {
  return RECOVER_PRESERVED.includes(state)
}
