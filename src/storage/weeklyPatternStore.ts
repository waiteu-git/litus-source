import { Storage } from './asyncStorage'
import {
  serializeWeeklyPatterns,
  deserializeWeeklyPatterns,
  type WeeklyPatternMap,
} from './weeklyPatternSerialize'
import type { WeeklyPattern } from '../timetableEvents/weeklyPattern'

const KEY = 'timetable.weeklyPatterns.v1'

export async function loadWeeklyPatterns(): Promise<WeeklyPatternMap> {
  return deserializeWeeklyPatterns(await Storage.getItem(KEY))
}

/** 科目コードのパターンを保存。休み週が無ければ削除（既定＝全週実施に戻す）。更新後マップを返す。 */
export async function saveWeeklyPattern(courseCode: string, p: WeeklyPattern): Promise<WeeklyPatternMap> {
  const m = await loadWeeklyPatterns()
  const next = { ...m }
  if (!p.off || Object.keys(p.off).length === 0) delete next[courseCode]
  else next[courseCode] = p
  await Storage.setItem(KEY, serializeWeeklyPatterns(next))
  return next
}
