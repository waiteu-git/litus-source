/**
 * 出欠状況の背景取得を「この起動でいま試みるべきか」を決める純粋関数（RN非依存・vitest可能）。
 *
 * 背景（2026-07-18 修正・多角レビューで反証通過した根本原因）:
 * v97 では onAttendanceStatsFinished が収集の**成否問わず** once-per-boot フラグを立てていた。
 * 起動直後の背景トリガが 0 件で終わるとフラグが立ち、以後フォアグラウンド復帰までリセットされない。
 * アプリを開きっぱなしで授業外にいる典型状況では復帰イベントが来ず、**二度と自動取得しなくなる**
 * （ユーザー報告「一度取得できないとずっと取得できない」の主因）。掲示は失敗時に syncSession を
 * 触らないため同症状が出ていなかった。
 *
 * 修正方針:
 * - **成功したときだけ**「この起動は完了」とみなす（succeededThisBoot）。
 * - 失敗は打ち切らず、**間隔（12分）を空けて最大回数（5回）まで再試行**する。
 *   間隔・回数の上限で、毎回失敗する端末でも CLASS を叩き続けない（[[litus-load-audit-2026-07-13]]）。
 * 実際の収集可否（授業中・オフライン・メンテ帯・鮮度TTL）は runner 側 decideClassSync が判定する。
 * ここは「そもそも次の試行機会を与えてよいか」だけを決める。
 */

/** 失敗後、次の試行までの最短間隔。前面滞在中でもこの間隔で回復の機会を与える。 */
export const ATTENDANCE_STATS_RETRY_INTERVAL_MS = 12 * 60 * 1000 // 12分
/** この起動での最大試行回数。毎回失敗する端末での無限リトライを防ぐ（復帰・手動で reset）。 */
export const ATTENDANCE_STATS_MAX_ATTEMPTS = 5

export type AttendanceStatsAttemptState = {
  /** 収集が成功して確定したか。**成功時のみ true**（失敗では立てない）。 */
  succeededThisBoot: boolean
  /** この起動で開始した試行回数（成功・失敗を問わない）。 */
  attempts: number
  /** 直近の試行開始時刻（epoch ms、未試行は null）。 */
  lastAttemptAt: number | null
  now: number
}

export function shouldAttemptAttendanceStats(s: AttendanceStatsAttemptState): boolean {
  if (s.succeededThisBoot) return false
  if (s.attempts >= ATTENDANCE_STATS_MAX_ATTEMPTS) return false
  if (s.lastAttemptAt != null && s.now - s.lastAttemptAt < ATTENDANCE_STATS_RETRY_INTERVAL_MS) return false
  return true
}
