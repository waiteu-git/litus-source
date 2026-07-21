import { Storage } from './asyncStorage'
import type { Quarter } from '../parsers/timetable'
import type { TimetableOverride, TimetableOverrides } from '../timetableEvents/quarter'
import { serializeTimetableOverrides, deserializeTimetableOverrides } from './timetableOverridesSerialize'

const OVERRIDES_KEY = 'timetable.overrides.v1'
const CURRENT_QUARTER_KEY = 'timetable.currentQuarter.v1'

export async function loadTimetableOverrides(): Promise<TimetableOverrides> {
  return deserializeTimetableOverrides(await Storage.getItem(OVERRIDES_KEY))
}

/**
 * 部分マージ保存。patch に quarter:undefined を明示すると指定を削除。結果が空になればキーごと削除して
 * ゴミを残さない（教室拡張など将来フィールドが増えても片方の編集で他方が消えないように）。
 */
export async function saveTimetableOverride(courseCode: string, patch: TimetableOverride): Promise<void> {
  const all = await loadTimetableOverrides()
  const next: TimetableOverride = { ...all[courseCode] }
  if ('quarter' in patch) {
    if (patch.quarter === undefined) delete next.quarter
    else next.quarter = patch.quarter
  }
  if (Object.keys(next).length === 0) delete all[courseCode]
  else all[courseCode] = next
  await Storage.setItem(OVERRIDES_KEY, serializeTimetableOverrides(all))
}

/** 「今が前半/後半か」の手動指定。null は未指定＝日付からの既定値を使う。 */
export async function loadCurrentQuarter(): Promise<Quarter | null> {
  const raw = await Storage.getItem(CURRENT_QUARTER_KEY)
  return raw === 'first' || raw === 'second' ? raw : null
}

export async function saveCurrentQuarter(quarter: Quarter | null): Promise<void> {
  if (quarter === null) await Storage.removeItem(CURRENT_QUARTER_KEY)
  else await Storage.setItem(CURRENT_QUARTER_KEY, quarter)
}
