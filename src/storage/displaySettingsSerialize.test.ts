import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DISPLAY_SETTINGS,
  deserializeDisplaySettings,
  serializeDisplaySettings,
  type DisplaySettings,
} from './displaySettingsSerialize'
import { toExamCountdownStart } from './displaySettingsSerialize'
import { DEFAULT_HOME_LAYOUT, toggleSection } from '../home/homeSections'
import { DEFAULT_SUBJECT_LAYOUT, reorderSubjectLayout } from '../subject/subjectSections'

describe('displaySettingsSerialize（現行挙動の固定・設計 A §7-1）', () => {
  it('null・空文字・壊れた JSON・オブジェクトでない値は既定', () => {
    for (const raw of [null, '', 'not json', '1', '"grid"', 'null', 'true']) {
      expect(deserializeDisplaySettings(raw)).toEqual(DEFAULT_DISPLAY_SETTINGS)
    }
  })

  it('既存4項目（時間割・課題・ホームの並び・科目詳細の並び）は往復で保たれる', () => {
    const s: DisplaySettings = {
      ...DEFAULT_DISPLAY_SETTINGS,
      timetableView: 'grid',
      assignmentsView: 'flat',
      homeLayout: toggleSection(DEFAULT_HOME_LAYOUT, 'examCountdown'),
      subjectLayout: reorderSubjectLayout(DEFAULT_SUBJECT_LAYOUT, 0, 2),
    }
    // 対照: 既定と違う値で往復させている（既定どうしの一致で緑になっていない）
    expect(s).not.toEqual(DEFAULT_DISPLAY_SETTINGS)
    expect(deserializeDisplaySettings(serializeDisplaySettings(s))).toEqual(s)
  })

  it('timetableView・assignmentsView の不正値は既定（list/bucket）になる', () => {
    const s = deserializeDisplaySettings(JSON.stringify({ timetableView: 'table', assignmentsView: 1 }))
    expect(s.timetableView).toBe('list')
    expect(s.assignmentsView).toBe('bucket')
  })

  it('並びの項目が無い・壊れていれば既定の並び（ほかの項目は読む）', () => {
    const s = deserializeDisplaySettings(JSON.stringify({ timetableView: 'grid', homeLayout: 'x' }))
    expect(s.homeLayout).toEqual(DEFAULT_HOME_LAYOUT)
    expect(s.subjectLayout).toEqual(DEFAULT_SUBJECT_LAYOUT)
    expect(s.timetableView).toBe('grid')
  })
})

describe('examCountdownStart（試験カウントダウンの表示開始・設計 A §7-2C）', () => {
  it('既定は always（今と同じ＝日付に関係なく出す）', () => {
    expect(DEFAULT_DISPLAY_SETTINGS.examCountdownStart).toBe('always')
    expect(deserializeDisplaySettings(null).examCountdownStart).toBe('always')
  })

  it.each(['always', 60, 30, 14, 7] as const)('プリセット %s は往復で保たれる', (v) => {
    const s: DisplaySettings = { ...DEFAULT_DISPLAY_SETTINGS, timetableView: 'grid', examCountdownStart: v }
    expect(deserializeDisplaySettings(serializeDisplaySettings(s))).toEqual(s)
  })

  it('項目の無い旧データは always（既存4項目はそのまま読む）', () => {
    const old = JSON.stringify({
      timetableView: 'grid',
      assignmentsView: 'flat',
      homeLayout: DEFAULT_HOME_LAYOUT,
      subjectLayout: DEFAULT_SUBJECT_LAYOUT,
    })
    const s = deserializeDisplaySettings(old)
    expect(s.examCountdownStart).toBe('always')
    expect(s.timetableView).toBe('grid')
    expect(s.assignmentsView).toBe('flat')
  })

  // it.each にしない: 要素が配列（[7]）だと vitest は引数として展開し、7 が渡って別の検査になる。
  it('不正値（文字列の数・プリセット外の数・null・真偽値・オブジェクト・配列など）は always に倒す（出る側）', () => {
    for (const bad of ['7', 10, null, 0, -7, 7.5, true, {}, [7], 'never']) {
      const raw = JSON.stringify({ ...DEFAULT_DISPLAY_SETTINGS, examCountdownStart: bad })
      expect(deserializeDisplaySettings(raw).examCountdownStart).toBe('always')
    }
  })

  it('toExamCountdownStart: 設定画面の Segmented のキーから写した値だけを通す', () => {
    expect(toExamCountdownStart('always')).toBe('always')
    for (const n of [60, 30, 14, 7] as const) expect(toExamCountdownStart(Number(String(n)))).toBe(n)
    // 陰性: 文字列のまま・プリセット外の数・NaN は always
    expect(toExamCountdownStart('7')).toBe('always')
    expect(toExamCountdownStart(21)).toBe('always')
    expect(toExamCountdownStart(Number('abc'))).toBe('always')
  })
})
