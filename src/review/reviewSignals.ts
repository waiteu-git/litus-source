/**
 * 評価依頼（F）の否決・適格に使う信号を、保存済みの生の値から作る純粋関数（RN非依存・vitest対象）。
 * 設計: docs/design/2026-09-24-F-store-review-prompt.md §4.3・§4.4・§10
 */
import type { CollectionHealthMap } from '../storage/collectionHealthSerialize'
import type { KillSwitchStatus } from '../health/killSwitch'
import { localDayKey } from './reviewState'

/**
 * 収集の健全性のうち、失敗として数える状態。maintenance・not_logged_in（大学側の事情）と
 * ok・empty_valid（正常）は数えない。
 */
const FAILURE_STATUSES: readonly string[] = ['structure_drift', 'blocked']

/**
 * 出席・リアペ送信の失敗（ok:false）のうち最新の時刻。入力コードの誤りも数える（待つ側へ倒す）。
 * 出席・リアペの成功は価値に数えないが、失敗は待つ理由に数える（非対称は意図どおり）。
 */
export function failureAtFromSubmitDiags(diags: ReadonlyArray<{ at: string; ok: boolean }>): number | null {
  let max: number | null = null
  for (const d of diags) {
    if (d.ok) continue
    const t = Date.parse(d.at)
    if (!Number.isFinite(t)) continue
    if (max === null || t > max) max = t
  }
  return max
}

/** 4収集（掲示・時間割・課題・出欠）のうち、失敗状態にあるものの最新の時刻。 */
export function failureAtFromHealth(map: CollectionHealthMap): number | null {
  let max: number | null = null
  for (const entry of Object.values(map)) {
    if (!entry) continue
    if (!FAILURE_STATUSES.includes(entry.health.status)) continue
    if (max === null || entry.at > max) max = entry.at
  }
  return max
}

/** null を除いた最大値。すべて null（または引数なし）なら null。 */
export function latestFailureAt(...times: Array<number | null>): number | null {
  let max: number | null = null
  for (const t of times) {
    if (t === null) continue
    if (max === null || t > max) max = t
  }
  return max
}

/**
 * 課題・掲示の同期成功の時刻（`lastAssignmentsAt`・`lastBulletinAt`）のどれかが、端末ローカルの今日か。
 * 出欠の取得（`lastAttendanceStatsAt`）は渡さない＝出席まわりを価値から外す裁定。
 * 未同期（0）・未来の時刻（時計のずれ）は数えない。
 */
export function hadValueToday(now: number, stamps: readonly number[]): boolean {
  const today = localDayKey(now)
  return stamps.some((t) => t > 0 && t <= now && localDayKey(t) === today)
}

export type ReviewKillStatus = 'unknown' | 'stopped' | 'notice' | 'clear'

/**
 * 停止指示（status.json）の状態を、評価依頼の否決用の結論へ畳む。
 * - null（未取得）は unknown＝出さない側。更新直後は別ビルドのキャッシュを捨てるので一時的に起こる。
 * - お知らせ帯は既読を見ない（message があれば止める）。既読の判定は KillSwitchProvider の内側にあり、
 *   外へ出すためだけにその層へ手を入れない。障害中に評価を求めない側に倒れる。
 */
export function reviewKillStatus(status: KillSwitchStatus | null): ReviewKillStatus {
  if (status === null) return 'unknown'
  if (status.disabledAll || status.disabled.length > 0) return 'stopped'
  if ((status.message ?? '').trim() !== '') return 'notice'
  return 'clear'
}
