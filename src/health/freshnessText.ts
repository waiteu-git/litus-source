/**
 * 「いつ取得したキャッシュか」を表す鮮度文言（純粋）。null は非表示。
 * 当日は時分のみ、前日以前は月日も付す。端末ローカル時刻で判定・整形する。
 */
/** 「HH:mm時点」「M/D HH:mm時点」だけの短縮版（ウィジェット等、1行に収める狭い場所用）。 */
export function formatFreshnessTime(at: number, now: Date): string | null {
  if (!Number.isFinite(at) || at <= 0) return null
  const t = new Date(at)
  const hh = String(t.getHours()).padStart(2, '0')
  const mm = String(t.getMinutes()).padStart(2, '0')
  const sameDay =
    t.getFullYear() === now.getFullYear() && t.getMonth() === now.getMonth() && t.getDate() === now.getDate()
  if (sameDay) return `${hh}:${mm}時点`
  return `${t.getMonth() + 1}/${t.getDate()} ${hh}:${mm}時点`
}

export function formatFreshness(at: number, now: Date): string | null {
  const t = formatFreshnessTime(at, now)
  return t ? `${t}の情報` : null
}
