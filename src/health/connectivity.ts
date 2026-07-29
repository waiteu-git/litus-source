import { useSyncExternalStore } from 'react'
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'

/**
 * 接続状態の単一の真実源。NetInfo購読をここに隔離し、同期ガード(isOnlineNow)と
 * 表示hook(useConnectivity)へ同じ状態を配る。fail-open: 未確定は online 扱い
 * （誤検知で収集を止めるより無駄打ち1回が安い）。
 */
let onlineNow = true
const listeners = new Set<() => void>()

// NetInfo 既定のリーチャビリティ probe を止める。**addEventListener より前に置くこと**
// （configure は既存 State を tearDown して作り直す＝先に張った listener が二度と呼ばれない）。
//
// netinfo 12.0.1 の既定 reachabilityUrl は 'https://clients3.google.com/generate_204'。
// 既定の `useNativeReachability: true` は「ネイティブが isInternetReachable を boolean で
// 返した時だけ」効く条件付きで、iOS の RNCNetInfo.mm が JS へ渡す辞書は
// type / isConnected / details の3キーのみ＝このキーを載せない。そのため JS 側の fetch へ
// フォールバックし、60秒ごと（reachabilityLongTimeout）に Google へ HEAD が出ていた。
// Android は ConnectivityReceiver.java が boolean を載せるので probe は走らない＝OS差。
// （2026-07-29 実測: iOS シミュレータで 61秒間隔・同一サイズの送信を確認）
//
// 規約（TermsConsentScreen の TERMS_BODY / docs/legal/terms-ja.md）は通信先を
// LETUS / CLASS / 大学のログイン基盤 / waiteu.dev / api.waiteu.dev に「限られます」と
// 列挙している。この probe はその外なので止める。reachabilityUrl を自前バックエンドへ
// 向け直す案は、全端末が60秒ごとに api を叩くことになるため採らない。
NetInfo.configure({ reachabilityShouldRun: () => false })

function deriveOnline(s: NetInfoState): boolean {
  // isInternetReachable は見ない。probe を止めた iOS では false 固定になり
  // （internetReachability.ts は check を走らせない時 false を確定させる）、
  // Android ではネイティブ値が入る＝OSで意味が食い違うため。接続有無だけで判定する。
  // 未確定(null)は online 扱い＝上記 fail-open の方針どおり。
  return s.isConnected !== false
}

// module ロード時に購読開始（アプリ全体で1本）。
NetInfo.addEventListener((s) => {
  const next = deriveOnline(s)
  if (next === onlineNow) return
  onlineNow = next
  for (const l of listeners) l()
})

export function isOnlineNow(): boolean {
  return onlineNow
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useConnectivity(): boolean {
  return useSyncExternalStore(subscribe, isOnlineNow, isOnlineNow)
}
