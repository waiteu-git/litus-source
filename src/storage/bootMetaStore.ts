import { Storage } from './asyncStorage'
import { isTimetableStale } from './refreshMetaStore'

// 前回 authed（ログイン確認成功）に到達したエポックms。ウォームスタート判定に使う。
// syncSession はメモリのみで再起動をまたげないため、これは永続化する。
const LAST_AUTHED_KEY = 'boot.lastAuthedAt.v1'

// 運用日の境界（午前4:00 = CLASSメンテ明け）。maintenanceWindow.ts と整合。
const OPERATIONAL_DAY_BOUNDARY_HOUR = 4

export async function loadLastAuthedAt(): Promise<number> {
  const raw = await Storage.getItem(LAST_AUTHED_KEY)
  const n = raw ? Number(raw) : 0
  return Number.isFinite(n) ? n : 0
}

export async function saveLastAuthedAt(at: number = Date.now()): Promise<void> {
  await Storage.setItem(LAST_AUTHED_KEY, String(at))
}

/** 4:00始まりの運用日を一意化した整数（等価比較専用・順序比較には使わない）。ローカル時刻ベース。 */
export function operationalDayIndex(t: number): number {
  const shifted = new Date(t - OPERATIONAL_DAY_BOUNDARY_HOUR * 60 * 60 * 1000)
  return shifted.getFullYear() * 10000 + shifted.getMonth() * 100 + shifted.getDate()
}

export function isSameOperationalDay(a: number, b: number): boolean {
  return operationalDayIndex(a) === operationalDayIndex(b)
}

/**
 * ウォームスタート（短縮版アニメ）にできるか。
 * 条件: 前回authedが同じ運用日 かつ 時間割が新鮮（=setupフェーズが走らない見込み）。
 * lastAuthedAt<=0（初回/未記録）や読み失敗（0扱い）は full（安全側）。
 */
export function isWarmBoot(
  lastAuthedAt: number,
  timetableRefreshedAt: number,
  now: number = Date.now(),
): boolean {
  if (lastAuthedAt <= 0) return false
  if (!isSameOperationalDay(lastAuthedAt, now)) return false
  if (isTimetableStale(timetableRefreshedAt, now)) return false
  return true
}
