/**
 * 表示形式の設定（設定タブ「表示」で新設）。時間割=リスト/グリッド、課題=バケット別/締切順、
 * ホーム・科目詳細の並び、試験カウントダウンの表示開始=いつでも/N日前から。
 */
import { DEFAULT_HOME_LAYOUT, normalizeHomeLayout, type HomeSectionPref } from '../home/homeSections'
import { DEFAULT_SUBJECT_LAYOUT, normalizeSubjectLayout, type SubjectSectionPref } from '../subject/subjectSections'
import { EXAM_LEAD_DAYS, type ExamLeadDays } from '../timetableEvents/classEvent'

export type TimetableView = 'list' | 'grid'
export type AssignmentsView = 'bucket' | 'flat'
/** 試験カウントダウンの表示開始（全体）。'always'＝日付に関係なく出す（従来どおり）。N＝試験日の N 日前の0:00から。 */
export type ExamCountdownStartSetting = 'always' | ExamLeadDays

export type DisplaySettings = {
  timetableView: TimetableView
  assignmentsView: AssignmentsView
  /** ホーム画面のセクション並び順・表示（ユーザーが設定タブで変更可能）。 */
  homeLayout: HomeSectionPref[]
  /** 科目詳細のセクション並び順・表示（全科目共通・ユーザーが設定タブで変更可能）。 */
  subjectLayout: SubjectSectionPref[]
  /**
   * 試験カウントダウンの表示開始（全体）。試験ごとの上書きは ClassEvent 側（設計 docs/design/2026-09-12-v11-train1-A.md）。
   * 🔴 必須のままにする。optional にすると、下の組み直しで足し忘れても tsc が止めず、保存はされるのに
   * 次の起動で「いつでも」に戻る（設計 A 禁止事項4）。
   */
  examCountdownStart: ExamCountdownStartSetting
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  timetableView: 'list',
  assignmentsView: 'bucket',
  homeLayout: DEFAULT_HOME_LAYOUT,
  subjectLayout: DEFAULT_SUBJECT_LAYOUT,
  examCountdownStart: 'always',
}

/** 保存値・画面の選択から表示開始を検める。'always' と数値の 60/30/14/7 だけ通し、それ以外は 'always'（出る側）。 */
export function toExamCountdownStart(v: unknown): ExamCountdownStartSetting {
  if (v === 'always') return 'always'
  return (EXAM_LEAD_DAYS as readonly unknown[]).includes(v) ? (v as ExamLeadDays) : 'always'
}

export function serializeDisplaySettings(s: DisplaySettings): string {
  return JSON.stringify(s)
}

/** null/壊れJSON/不正値は既定（list/bucket/always・既定の並び）にフォールバック。 */
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
  const subjectLayout = normalizeSubjectLayout((e as { subjectLayout?: unknown }).subjectLayout)
  const examCountdownStart = toExamCountdownStart((e as { examCountdownStart?: unknown }).examCountdownStart)
  return { timetableView, assignmentsView, homeLayout, subjectLayout, examCountdownStart }
}
