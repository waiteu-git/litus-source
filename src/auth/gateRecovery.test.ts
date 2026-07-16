import { describe, expect, it } from 'vitest'
import { RECOVER_LIMIT, recoverOutcome } from './gateRecovery'

/**
 * 起動ゲートの自動復帰（WebView作り直し）の上限判定。
 * 上限までは 'retry'（もう一度probe）、上限に達したら 'connError'（接続エラーカード）。
 * ここが 'needsLogin' に落ちていたのが「通信不良でCLASSログイン画面が出る」バグの副因。
 */
describe('recoverOutcome', () => {
  it('試行回数が上限未満なら retry', () => {
    expect(recoverOutcome(0)).toBe('retry')
    expect(recoverOutcome(RECOVER_LIMIT - 1)).toBe('retry')
  })
  it('試行回数が上限に達したら connError（needsLoginではない）', () => {
    expect(recoverOutcome(RECOVER_LIMIT)).toBe('connError')
    expect(recoverOutcome(RECOVER_LIMIT + 5)).toBe('connError')
  })
  it('RECOVER_LIMIT は正の整数', () => {
    expect(Number.isInteger(RECOVER_LIMIT)).toBe(true)
    expect(RECOVER_LIMIT).toBeGreaterThan(0)
  })
})
