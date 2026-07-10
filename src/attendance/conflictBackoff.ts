/**
 * PC競合（他画面でCLASS使用中）時の再試行間隔。
 *
 * 設計: docs/superpowers/specs/2026-07-10-attendance-conflict-backoff-design.md
 *
 * PC競合はサーバー側の一時的な状態ではなく「ユーザーがPCでCLASSを開いている」という
 * 人間の行動待ちの状態で、閉じられるまで何度叩いても解けない。1回の再試行ごとに
 * Shibboleth/SAMLチェーン全体を歩くため、固定間隔での無限リトライは大学のSSO基盤に
 * 対して無視できない負荷になる。指数バックオフで伸ばし、数回で打ち切る。
 */

/** 初回の再試行までの待ち時間。「PCをすぐ閉じた」ケースの体験を維持するため従来値を据え置く。 */
export const CONFLICT_BASE_MS = 7000

/** 間隔の上限。CONFLICT_MAX_ATTEMPTS の範囲では到達しないが、上限回数を増やしたときの保険。 */
export const CONFLICT_MAX_MS = 120000

/** 自動再試行の打ち切り回数。7+14+28+56+112 = 累計約3.6分で諦める。 */
export const CONFLICT_MAX_ATTEMPTS = 5

/** 復帰トリガー（前面復帰・画面フォーカス・再確認ボタン）の連打に対する下限間隔。 */
export const CONFLICT_MIN_GAP_MS = 7000

/**
 * attempt 回目（0始まり）の再試行までの待ち時間。±20%のジッタを掛ける。
 *
 * 授業開始時刻は全学生で同期しているため競合の発生も同期し得る。固定間隔だと
 * 全ユーザーの再試行が同一秒に重なるので、ジッタで位相をばらす。
 *
 * rand は [0, 1) を呼び出し側から注入する（テストを決定的にするため内部で Math.random() を呼ばない）。
 */
export function conflictDelayMs(attempt: number, rand: number): number {
  const raw = Math.min(CONFLICT_BASE_MS * 2 ** attempt, CONFLICT_MAX_MS)
  return Math.round(raw * (0.8 + 0.4 * rand))
}

/** これ以上の自動再試行を行わない状態か。 */
export function isConflictExhausted(attempt: number): boolean {
  return attempt >= CONFLICT_MAX_ATTEMPTS
}
