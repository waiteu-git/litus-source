/**
 * 授業の週次実施パターン（毎週 / 隔週）。隔週は「基準週の偶奇(parity)」で自動判定し、
 * 祝日等でズレたら「その週だけの例外(exceptions)」で上書きする（週ごとのカスタマイズ）。
 * 端末非依存の純粋ロジック（now/date注入）で vitest テスト可能。
 */
export type WeeklyPattern = {
  mode: 'every' | 'biweekly'
  /** 隔週で「実施する週」の parity（週インデックス%2）。既定 0。 */
  anchorParity?: 0 | 1
  /** 週(月曜日キー 'YYYY-MM-DD') → 実施(true)/休み(false)。パターンより優先。 */
  exceptions?: Record<string, boolean>
}

/** その日が属する週の月曜日（ローカル日付）。 */
export function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = x.getDay() // 0=日..6=土
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  return x
}

/** 週の月曜日キー 'YYYY-MM-DD'（例外マップのキー・表示用）。 */
export function weekMondayKey(d: Date): string {
  const m = mondayOf(d)
  const mm = String(m.getMonth() + 1).padStart(2, '0')
  const dd = String(m.getDate()).padStart(2, '0')
  return `${m.getFullYear()}-${mm}-${dd}`
}

// 固定基準（2024-01-01 は月曜）。ここからの週数の偶奇で A週/B週 を決める。
const EPOCH = new Date(2024, 0, 1)

/** その週の parity（週インデックス%2）。隔週の A週/B週 判定に使う。 */
export function weekParity(d: Date): 0 | 1 {
  const days = Math.round((mondayOf(d).getTime() - EPOCH.getTime()) / 86400000)
  const weeks = Math.round(days / 7)
  return (((weeks % 2) + 2) % 2) as 0 | 1
}

export function defaultPattern(): WeeklyPattern {
  return { mode: 'every' }
}

/** その日にこの授業が実施されるか。例外があればパターンより優先。 */
export function isClassOnDate(p: WeeklyPattern | undefined, d: Date): boolean {
  if (!p) return true
  const ex = p.exceptions?.[weekMondayKey(d)]
  if (p.mode === 'every') return ex === undefined ? true : ex
  const base = weekParity(d) === (p.anchorParity ?? 0)
  return ex === undefined ? base : ex
}

/** 「この週を実施週にする」＝隔週にして parity 基準を合わせ、その週の例外は消す（再アンカー）。 */
export function setBiweeklyAnchor(p: WeeklyPattern, d: Date): WeeklyPattern {
  const key = weekMondayKey(d)
  const ex = { ...(p.exceptions ?? {}) }
  delete ex[key]
  return {
    ...p,
    mode: 'biweekly',
    anchorParity: weekParity(d),
    exceptions: Object.keys(ex).length ? ex : undefined,
  }
}

/** その週の実施有無を明示上書きする。パターンの基本判定と一致するなら無駄な例外を残さない。 */
export function setWeekException(p: WeeklyPattern, d: Date, holds: boolean): WeeklyPattern {
  const key = weekMondayKey(d)
  const base = p.mode === 'biweekly' ? weekParity(d) === (p.anchorParity ?? 0) : true
  const ex = { ...(p.exceptions ?? {}) }
  if (holds === base) delete ex[key]
  else ex[key] = holds
  return { ...p, exceptions: Object.keys(ex).length ? ex : undefined }
}
