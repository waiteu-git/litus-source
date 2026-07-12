/**
 * 「いつ取得したキャッシュか」を表す鮮度文言（純粋）。null は非表示。
 * 当日は時分のみ、前日以前は月日も付す。端末ローカル時刻で判定・整形する。
 */
export function formatFreshness(at: number, now: Date): string | null {
  if (!Number.isFinite(at) || at <= 0) return null
  const t = new Date(at)
  const hh = String(t.getHours()).padStart(2, '0')
  const mm = String(t.getMinutes()).padStart(2, '0')
  const sameDay =
    t.getFullYear() === now.getFullYear() && t.getMonth() === now.getMonth() && t.getDate() === now.getDate()
  if (sameDay) return `${hh}:${mm}時点の情報`
  return `${t.getMonth() + 1}/${t.getDate()} ${hh}:${mm}時点の情報`
}
