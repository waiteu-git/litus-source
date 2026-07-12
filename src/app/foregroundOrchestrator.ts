/**
 * フォアグラウンド復帰オーケストレータ（RN層）。
 * AppState 'active' の購読をアプリで1本に集約し、復帰処理をスロット別オフセットで段階発火する。
 * - デバウンス: PULSE_MIN_GAP_MS 未満の再復帰では発火しない（shouldFirePulse）。
 * - 背面へ戻ったら未発火のスロットは取り消す（背面でのWebView注入・同期開始を防ぐ）。
 * - 各リスナーの実行条件（送信中スキップ等）は従来どおり呼び出し側が持つ。ここは時機だけを司る。
 */
import { AppState, type AppStateStatus } from 'react-native'
import { PULSE_MIN_GAP_MS, SLOT_OFFSETS_MS, shouldFirePulse, type ForegroundSlot } from './foregroundPulse'

type Listener = () => void

const listeners = new Map<ForegroundSlot, Set<Listener>>()
const timers = new Map<ForegroundSlot, ReturnType<typeof setTimeout>>()
let lastPulseAt: number | null = null
let subscription: { remove: () => void } | null = null

function clearPendingTimers() {
  for (const t of timers.values()) clearTimeout(t)
  timers.clear()
}

function fireSlot(slot: ForegroundSlot) {
  timers.delete(slot)
  const set = listeners.get(slot)
  if (!set) return
  for (const fn of [...set]) {
    try {
      fn()
    } catch {
      // 1リスナーの失敗で他スロットを巻き込まない
    }
  }
}

function onAppStateChange(s: AppStateStatus) {
  if (s !== 'active') {
    clearPendingTimers()
    return
  }
  if (!shouldFirePulse(lastPulseAt, Date.now(), PULSE_MIN_GAP_MS)) return
  lastPulseAt = Date.now()
  clearPendingTimers()
  for (const slot of Object.keys(SLOT_OFFSETS_MS) as ForegroundSlot[]) {
    if (!listeners.get(slot)?.size) continue
    timers.set(
      slot,
      setTimeout(() => fireSlot(slot), SLOT_OFFSETS_MS[slot]),
    )
  }
}

/**
 * フォアグラウンド復帰パルスを購読する。戻り値は購読解除関数（unmount時に必ず呼ぶこと）。
 * 発火時点で背面に戻っていればスロットごと取り消される。
 */
export function subscribeForeground(slot: ForegroundSlot, fn: Listener): () => void {
  let set = listeners.get(slot)
  if (!set) {
    set = new Set()
    listeners.set(slot, set)
  }
  set.add(fn)
  if (!subscription) subscription = AppState.addEventListener('change', onAppStateChange)
  return () => {
    set.delete(fn)
    if (set.size === 0) listeners.delete(slot)
    if (listeners.size === 0) {
      clearPendingTimers()
      subscription?.remove()
      subscription = null
    }
  }
}
