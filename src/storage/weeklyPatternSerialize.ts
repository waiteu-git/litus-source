import type { WeeklyPattern } from '../timetableEvents/weeklyPattern'

/** 科目コード → 週次実施パターン。 */
export type WeeklyPatternMap = Record<string, WeeklyPattern>

export function serializeWeeklyPatterns(m: WeeklyPatternMap): string {
  return JSON.stringify(m)
}

/**
 * v2(off集合)を読む。旧v1({mode,anchorParity,exceptions})が来たら exceptions の false(=休み)を off に移行する
 * （mode/anchorParity は範囲情報が無く再現できないため破棄。開発版のみのため許容）。
 */
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
    const off: Record<string, true> = {}
    if (e.off && typeof e.off === 'object') {
      for (const [wk, val] of Object.entries(e.off as Record<string, unknown>)) {
        if (val === true) off[wk] = true
      }
    }
    // v1 移行: exceptions の false(=休み) を off に。
    if (e.exceptions && typeof e.exceptions === 'object') {
      for (const [wk, val] of Object.entries(e.exceptions as Record<string, unknown>)) {
        if (val === false) off[wk] = true
      }
    }
    out[k] = Object.keys(off).length ? { off } : {}
  }
  return out
}
