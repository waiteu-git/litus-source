/**
 * フォアグラウンド復帰パルスの判定と段階配置（純粋・RN非依存）。
 * AppState 'active' で Auth再温め・出席再判定・通知貼り直し・LETUS再同期が同時発火する
 * thundering herd を、(1)最小間隔デバウンス (2)スロット別オフセットの段階発火 で協調させる。
 * 実際のAppState購読・タイマー管理は foregroundOrchestrator.ts（RN層）が担う。
 */

/** これ未満の間隔で再び 'active' になっても発火し直さない（高速なアプリ切替の抑制）。 */
export const PULSE_MIN_GAP_MS = 5000

/**
 * 復帰後にスロットを発火させる遅延。軽い順に前へ:
 * - authWarmup / timetableReload: 軽量（WebView温め直し・ローカル読み込み）。即時。
 * - attendance: 出席WebViewへの再判定注入。授業確認は優先度が高いので早め。
 * - notifications: 通知の貼り直し（時間割再読込の反映後が望ましい）。
 * - letusSync: LETUSフル同期（最も重い）。他が落ち着いてから。
 */
export const SLOT_OFFSETS_MS = {
  authWarmup: 0,
  timetableReload: 0,
  attendance: 1200,
  notifications: 2500,
  letusSync: 4000,
} as const

export type ForegroundSlot = keyof typeof SLOT_OFFSETS_MS

/** 前回パルスから最小間隔が空いていれば発火してよい。lastPulseAt=null は初回。 */
export function shouldFirePulse(
  lastPulseAt: number | null,
  now: number,
  minGapMs: number = PULSE_MIN_GAP_MS,
): boolean {
  if (lastPulseAt === null) return true
  return now - lastPulseAt >= minGapMs
}
