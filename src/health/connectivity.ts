import { useSyncExternalStore } from 'react'
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'

/**
 * 接続状態の単一の真実源。NetInfo購読をここに隔離し、同期ガード(isOnlineNow)と
 * 表示hook(useConnectivity)へ同じ状態を配る。fail-open: 未確定は online 扱い
 * （誤検知で収集を止めるより無駄打ち1回が安い）。
 */
let onlineNow = true
const listeners = new Set<() => void>()

function deriveOnline(s: NetInfoState): boolean {
  // reachability が確定していればそれを優先、null の間は接続有無にフォールバック、両方nullは true。
  if (s.isInternetReachable === false) return false
  if (s.isInternetReachable === true) return true
  if (s.isConnected === false) return false
  return true
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
