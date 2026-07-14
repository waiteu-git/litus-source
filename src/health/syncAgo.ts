/**
 * ホーム上部の同期バーに出す「どのくらい前に同期したか」（純粋・RN非依存）。
 * combinedLastSync は掲示・課題の保存済み最終成功時刻を合成する。両方あるときは古い方＝
 * 「すべてのデータが少なくともこの新しさ」を保証する時刻を返す（新しい方を出すと片方が
 * 古いのに新しく見える）。formatSyncAgo は相対表記へ写像する。
 */

export function combinedLastSync(bulletinAt: number, letusAt: number): number | null {
  const a = Number.isFinite(bulletinAt) && bulletinAt > 0 ? bulletinAt : 0
  const b = Number.isFinite(letusAt) && letusAt > 0 ? letusAt : 0
  if (a > 0 && b > 0) return Math.min(a, b)
  if (a > 0) return a
  if (b > 0) return b
  return null
}

const MIN = 60_000

/** 相対表記。null/0以下 → '未同期'。将来時刻（時計ずれ）は「たった今」に丸める。 */
export function formatSyncAgo(at: number | null, now: Date): string {
  if (at == null || !(at > 0)) return '未同期'
  const diff = now.getTime() - at
  if (diff < MIN) return 'たった今同期'
  const mins = Math.floor(diff / MIN)
  if (mins < 60) return `${mins}分前に同期`
  const d = new Date(at)
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  if (sameDay) return `${Math.floor(mins / 60)}時間前に同期`
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}に同期`
}

/**
 * ヘッダーの同期チップ向けの短縮鮮度（「に同期」suffix・時刻を落とす）。狭いヘッダー幅に収めるため
 * formatSyncAgo とは別に持つ（未同期→'未同期'、直近→'たった今'、'N分前'/'N時間前'、別日→'M/D'）。
 */
export function formatSyncAgoShort(at: number | null, now: Date): string {
  if (at == null || !(at > 0)) return '未同期'
  const diff = now.getTime() - at
  if (diff < MIN) return 'たった今'
  const mins = Math.floor(diff / MIN)
  if (mins < 60) return `${mins}分前`
  const d = new Date(at)
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  if (sameDay) return `${Math.floor(mins / 60)}時間前`
  return `${d.getMonth() + 1}/${d.getDate()}`
}
