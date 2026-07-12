export type PersonalDayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export const PERSONAL_DAYS: PersonalDayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

/**
 * 授業以外の毎週繰り返しの個人予定（バイト・部活等）。日付は持たず day+periods で毎週固定。
 * periods は 0（0限=早朝）を許可。実時刻は note に自由記述する。
 */
export type PersonalEvent = {
  id: string
  title: string
  day: PersonalDayKey
  periods: number[]
  place: string | null
  note: string | null
  color: string | null // 予約フィールド（MVPは未使用）
  createdAt: string
}

/** 決定論的なID生成（Math.random非依存・seedの簡易ハッシュ）。 */
export function makePersonalEventId(seed: { createdAt: string; title: string; day: PersonalDayKey }): string {
  const s = `${seed.createdAt}|${seed.title}|${seed.day}`
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return `pe_${h.toString(36)}`
}
