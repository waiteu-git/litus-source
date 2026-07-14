/** 表示形式の設定（設定タブ「表示」で新設）。時間割=リスト/グリッド、課題=バケット別/締切順。 */
import { DEFAULT_HOME_LAYOUT, normalizeHomeLayout, type HomeSectionPref } from '../home/homeSections'

export type TimetableView = 'list' | 'grid'
export type AssignmentsView = 'bucket' | 'flat'

export type DisplaySettings = {
  timetableView: TimetableView
  assignmentsView: AssignmentsView
  /** ホーム画面のセクション並び順・表示（ユーザーが設定タブで変更可能）。 */
  homeLayout: HomeSectionPref[]
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  timetableView: 'list',
  assignmentsView: 'bucket',
  homeLayout: DEFAULT_HOME_LAYOUT,
}

export function serializeDisplaySettings(s: DisplaySettings): string {
  return JSON.stringify(s)
}

/** null/壊れJSON/不正値は既定（list/bucket）にフォールバック。 */
export function deserializeDisplaySettings(raw: string | null): DisplaySettings {
  if (!raw) return DEFAULT_DISPLAY_SETTINGS
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return DEFAULT_DISPLAY_SETTINGS
  }
  if (typeof parsed !== 'object' || parsed === null) return DEFAULT_DISPLAY_SETTINGS
  const e = parsed as Partial<DisplaySettings>
  const timetableView: TimetableView = e.timetableView === 'grid' ? 'grid' : 'list'
  const assignmentsView: AssignmentsView = e.assignmentsView === 'flat' ? 'flat' : 'bucket'
  const homeLayout = normalizeHomeLayout((e as { homeLayout?: unknown }).homeLayout)
  return { timetableView, assignmentsView, homeLayout }
}
