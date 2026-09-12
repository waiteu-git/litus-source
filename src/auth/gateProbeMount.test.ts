import { describe, expect, it } from 'vitest'
import { shouldMountGateProbe } from './gateProbeMount'
import { isRecoverPreserved, type GateStateName } from './gateRecovery'

// 全10状態。状態が増えたら satisfies が型エラーで知らせる（ここでも決め直す）。
const EVERY_STATE = {
  loading: true,
  needsConsent: true,
  firstRun: true,
  checking: true,
  needsLogin: true,
  setup: true,
  sync: true,
  authed: true,
  maintenance: true,
  connError: true,
} satisfies Record<GateStateName, true>
const ALL = Object.keys(EVERY_STATE) as GateStateName[]

describe('🔴 規約の同意が確定するまで probe WebView を作らない（設計 PC）', () => {
  it('T4 loading（同意済みの版をまだ読めていない）では作らない', () => {
    expect(shouldMountGateProbe('loading')).toBe(false)
  })

  it('T5 needsConsent（規約画面・新規と再同意）では作らない', () => {
    expect(shouldMountGateProbe('needsConsent')).toBe(false)
  })

  it('T1 checking では作る（probe の判定を待つ唯一の状態。作らないと12秒で必ず接続エラー）', () => {
    expect(shouldMountGateProbe('checking')).toBe(true)
  })

  it('T2 firstRun では作る（同意の後。スライドの裏で probe を走らせる既存の挙動＝オーナー裁定）', () => {
    expect(shouldMountGateProbe('firstRun')).toBe(true)
  })

  it('T3 同意の後の状態はすべて今どおり作る', () => {
    for (const s of ['needsLogin', 'setup', 'sync', 'authed', 'maintenance', 'connError'] as const) {
      expect(shouldMountGateProbe(s)).toBe(true)
    }
  })

  it('T7 作らない状態はちょうど loading と needsConsent の2つ', () => {
    expect(ALL.filter((s) => !shouldMountGateProbe(s))).toEqual(['loading', 'needsConsent'])
  })

  it('T6 作らない状態は recover でも画面を保持する（RECOVER_PRESERVED を掃除しない＝二重の防御）', () => {
    const notMounted = ALL.filter((s) => !shouldMountGateProbe(s))
    expect(notMounted.length).toBeGreaterThan(0)
    for (const s of notMounted) expect(isRecoverPreserved(s)).toBe(true)
  })
})
