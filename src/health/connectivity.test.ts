import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NetInfoState } from '@react-native-community/netinfo'

/**
 * NetInfo の既定リーチャビリティ probe（clients3.google.com）を止めた状態を固定する。
 *
 * 背景（2026-07-29 実測）: netinfo 12.0.1 の既定は
 * `reachabilityUrl: 'https://clients3.google.com/generate_204'` で、
 * `useNativeReachability: true` は「ネイティブが isInternetReachable を boolean で返した時だけ」効く。
 * iOS の RNCNetInfo.mm はこのキーを一切載せない（type / isConnected / details の3キーのみ）ため
 * 必ず JS 側の fetch にフォールバックし、60秒ごとに Google へ HEAD が出ていた。
 * Android は ConnectivityReceiver.java が boolean を載せるので probe は走らない＝OS差だった。
 *
 * 規約（TermsConsentScreen の TERMS_BODY / docs/legal/terms-ja.md）は通信先を
 * LETUS / CLASS / 大学のログイン基盤 / waiteu.dev / api.waiteu.dev に「限られます」と列挙している。
 * この probe はその列挙外なので、規約を実態に寄せるのではなく probe 自体を止める。
 *
 * ネイティブモジュールを引く層なので netinfo は丸ごとモックし、
 * connectivity.ts の配線（configure の順序）と判定ロジックだけを固定する。
 */

type Listener = (s: NetInfoState) => void

const order: string[] = []
let lastConfig: Record<string, unknown> | null = null
let listener: Listener | null = null

vi.mock('@react-native-community/netinfo', () => ({
  default: {
    configure: (cfg: Record<string, unknown>) => {
      order.push('configure')
      lastConfig = cfg
    },
    addEventListener: (cb: Listener) => {
      order.push('addEventListener')
      listener = cb
      return () => {}
    },
  },
}))

/** NetInfoState を必要なキーだけ組む（details/type は判定に使わない）。 */
function state(partial: Partial<NetInfoState>): NetInfoState {
  return { type: 'wifi', details: {}, ...partial } as NetInfoState
}

async function loadModule() {
  order.length = 0
  lastConfig = null
  listener = null
  vi.resetModules()
  return await import('./connectivity')
}

describe('connectivity: NetInfo の既定 probe を止める', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('configure を addEventListener より前に呼ぶ', async () => {
    await loadModule()
    // netinfo の configure は「既存の State を tearDown して作り直す」＝
    // 先に張った listener が二度と呼ばれなくなる（index.ts の注記どおり）。順序が逆だと収集が死ぬ。
    expect(order).toEqual(['configure', 'addEventListener'])
  })

  it('reachabilityShouldRun が false を返す（＝第三者への probe が出ない）', async () => {
    await loadModule()
    expect(lastConfig).not.toBeNull()
    const shouldRun = lastConfig?.reachabilityShouldRun as (() => boolean) | undefined
    expect(typeof shouldRun).toBe('function')
    expect(shouldRun?.()).toBe(false)
  })

  it('reachabilityUrl を第三者ホストへ向け直していない（自前バックエンドも叩かない）', async () => {
    await loadModule()
    // 「waiteu.dev へ向ける」案は 60秒ごとの自前バックエンド叩きになるため採らない。
    expect(lastConfig).not.toHaveProperty('reachabilityUrl')
  })
})

describe('connectivity: オンライン判定', () => {
  it('probe 停止で isInternetReachable が false 固定になっても、接続があれば online', async () => {
    const mod = await loadModule()
    // ここが要点。reachabilityShouldRun:false のとき internetReachability.ts は
    // isInternetReachable を false に確定させる。これを offline と読むと恒久オフラインになる。
    listener?.(state({ isConnected: true, isInternetReachable: false }))
    expect(mod.isOnlineNow()).toBe(true)
  })

  it('接続なしは offline', async () => {
    const mod = await loadModule()
    listener?.(state({ isConnected: false, isInternetReachable: false }))
    expect(mod.isOnlineNow()).toBe(false)
  })

  it('接続が戻れば online に復帰する', async () => {
    const mod = await loadModule()
    listener?.(state({ isConnected: false, isInternetReachable: false }))
    expect(mod.isOnlineNow()).toBe(false)
    listener?.(state({ isConnected: true, isInternetReachable: false }))
    expect(mod.isOnlineNow()).toBe(true)
  })

  it('未確定（null）は online 扱い＝fail-open', async () => {
    const mod = await loadModule()
    listener?.(state({ isConnected: null, isInternetReachable: null }))
    expect(mod.isOnlineNow()).toBe(true)
  })

  it('isInternetReachable が true でも接続なしなら offline（ネイティブ値に引きずられない）', async () => {
    const mod = await loadModule()
    // Android はネイティブが isInternetReachable を載せるので値が来るが、判定には使わない。
    // 両OSで挙動を揃えるため isConnected だけを見る。
    listener?.(state({ isConnected: false, isInternetReachable: true }))
    expect(mod.isOnlineNow()).toBe(false)
  })
})
