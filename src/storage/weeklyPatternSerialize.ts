import type { WeeklyPattern } from '../timetableEvents/weeklyPattern'

/** 科目コード → 週次実施パターン。 */
export type WeeklyPatternMap = Record<string, WeeklyPattern>

export function serializeWeeklyPatterns(m: WeeklyPatternMap): string {
  return JSON.stringify(m)
}

export function deserializeWeeklyPatterns(raw: string | null): WeeklyPatternMap {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null) return {}
  const out: WeeklyPatternMap = {}
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== 'object' || v === null) continue
    const e = v as Record<string, unknown>
    const p: WeeklyPattern = { mode: e.mode === 'biweekly' ? 'biweekly' : 'every' }
    if (e.anchorParity === 0 || e.anchorParity === 1) p.anchorParity = e.anchorParity
    if (e.exceptions && typeof e.exceptions === 'object') {
      const ex: Record<string, boolean> = {}
      for (const [wk, val] of Object.entries(e.exceptions as Record<string, unknown>)) {
        if (typeof val === 'boolean') ex[wk] = val
      }
      if (Object.keys(ex).length) p.exceptions = ex
    }
    out[k] = p
  }
  return out
}
