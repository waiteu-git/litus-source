/**
 * 評価依頼（F）の否決・適格に使う信号を、保存済みの生の値から作る純粋関数（RN非依存・vitest対象）。
 * 設計: docs/design/2026-09-24-F-store-review-prompt.md §4.3・§4.4・§10
 */
import type { CollectionHealthMap } from '../storage/collectionHealthSerialize'
import type { CollectionHealth } from '../health/collectionHealth'
import type { KillSwitchStatus } from '../health/killSwitch'
import type { TimetableCollection } from '../collect/timetableMessage'
import type { ClassActivePredicate } from '../attendance/homeBanner'
import { isInActiveClassPeriod } from '../attendance/classPeriod'
import { localDayKey } from './reviewState'

/**
 * 収集の健全性のうち、失敗として数える状態。maintenance・not_logged_in（大学側の事情）と
 * ok・empty_valid（正常）は数えない。
 */
const FAILURE_STATUSES: readonly CollectionHealth['status'][] = ['structure_drift', 'blocked']

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

/** 授業が始まる何分前から出さないか。時間割を確かめに来るコマ間・授業の直前を避ける。 */
export const CLASS_MARGIN_BEFORE_MIN = 25
/** 授業が終わって何分後まで出さないか。授業直後の移動・次の教室の確認を避ける。 */
export const CLASS_MARGIN_AFTER_MIN = 10

/**
 * 授業の前後の余白の中か（授業中・開始の25分前〜終了の10分後）。
 * 授業中・開始5分前は出席エンジンの稼働（attendanceRunning）でも否決されるが、コマ間の休み時間や
 * 授業の直後は稼働の外で、時間割・教室を確かめに来た人に当たる。既存の isInActiveClassPeriod を
 * 前は preMinutes を広げ、後ろは「10分前の時刻」で見て使い回す（科目の終了済み判定も同じ述語）。
 */
export function nearClassPeriod(
  timetable: TimetableCollection[],
  now: Date,
  isActive: ClassActivePredicate,
): boolean {
  if (isInActiveClassPeriod(timetable, now, isActive, CLASS_MARGIN_BEFORE_MIN)) return true
  return isInActiveClassPeriod(timetable, new Date(now.getTime() - CLASS_MARGIN_AFTER_MIN * 60_000), isActive, 0)
}
