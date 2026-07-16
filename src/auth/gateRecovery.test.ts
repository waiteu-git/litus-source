import { describe, expect, it } from 'vitest'
import {
  RECOVER_LIMIT,
  RECOVER_PRESERVED,
  isRecoverPreserved,
  recoverOutcome,
  recoverPlan,
} from './gateRecovery'

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

describe('recoverPlan', () => {
  it('可視ログイン中(needsLogin)は何回失敗しても noop（入力中の認証情報を消さない）', () => {
    expect(recoverPlan('needsLogin', 0)).toBe('noop')
    expect(recoverPlan('needsLogin', RECOVER_LIMIT + 9)).toBe('noop')
  })
  it('接続エラー中(connError)は noop（再probeは専用intervalが駆動＝リロード連発を防ぐ）', () => {
    expect(recoverPlan('connError', 0)).toBe('noop')
    expect(recoverPlan('connError', RECOVER_LIMIT + 9)).toBe('noop')
  })
  it('通常フローは上限未満で retry・上限で toConnError', () => {
    expect(recoverPlan('checking', 0)).toBe('retry')
    expect(recoverPlan('checking', RECOVER_LIMIT - 1)).toBe('retry')
    expect(recoverPlan('checking', RECOVER_LIMIT)).toBe('toConnError')
  })
  it('保持対象の画面でも plan 自体は retry/toConnError（画面保持は isRecoverPreserved で別途担保）', () => {
    expect(recoverPlan('needsConsent', RECOVER_LIMIT)).toBe('toConnError')
    expect(recoverPlan('firstRun', 0)).toBe('retry')
  })
})

describe('RECOVER_PRESERVED / isRecoverPreserved', () => {
  it('規約同意画面(needsConsent)は必ず保持対象（消えると規約バイパスに繋がる）', () => {
    expect(isRecoverPreserved('needsConsent')).toBe(true)
    expect(RECOVER_PRESERVED).toContain('needsConsent')
  })
  it('firstRun / loading も保持対象', () => {
    expect(isRecoverPreserved('firstRun')).toBe(true)
    expect(isRecoverPreserved('loading')).toBe(true)
  })
  it('checking は保持対象でない（connError/needsLogin へ遷移してよい）', () => {
    expect(isRecoverPreserved('checking')).toBe(false)
  })
})
