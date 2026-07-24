import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HOME_LAYOUT,
  HOME_SECTION_ORDER,
  normalizeHomeLayout,
  moveSection,
  reorderHomeLayout,
  toggleSection,
  type HomeSectionPref,
} from './homeSections'

describe('normalizeHomeLayout', () => {
  it('null/非配列は既定を返す', () => {
    expect(normalizeHomeLayout(null)).toEqual(DEFAULT_HOME_LAYOUT)
    expect(normalizeHomeLayout('x')).toEqual(DEFAULT_HOME_LAYOUT)
    expect(normalizeHomeLayout({})).toEqual(DEFAULT_HOME_LAYOUT)
  })

  it('保存順を維持し、欠けた既知キーをアンカー位置へ挿入、不明キー/重複を除去', () => {
    const raw = [
      { key: 'deadlines', enabled: true },
      { key: 'nowClass', enabled: false },
      { key: 'unknownX', enabled: true },
      { key: 'deadlines', enabled: true }, // 重複
    ]
    const out = normalizeHomeLayout(raw)
    // 欠けキーは「既定順で自分より前にある全キーの最後尾の直後」へ。deadlines(0)/nowClass(1)を
    // アンカーに examCountdown→todayChanges→letusNews→bulletins が連なり、laterClasses/entries は末尾に落ちる。
    expect(out.map((s) => s.key)).toEqual([
      'deadlines',
      'nowClass',
      'examCountdown',
      'todayChanges',
      'letusNews',
      'bulletins',
      'laterClasses',
      'entries',
    ])
    expect(out.find((s) => s.key === 'nowClass')!.enabled).toBe(false)
  })

  it('旧既定順（letusNews登場前）の保存値では letusNews がCLASS掲示の直前に入る', () => {
    // v76時点の既定順で保存されたレイアウト＝letusNews だけが欠けている状態。
    const saved: HomeSectionPref[] = [
      { key: 'nowClass', enabled: true },
      { key: 'todayChanges', enabled: true },
      { key: 'bulletins', enabled: true },
      { key: 'deadlines', enabled: true },
      { key: 'laterClasses', enabled: true },
      { key: 'entries', enabled: true },
    ]
    const out = normalizeHomeLayout(saved)
    expect(out.map((s) => s.key)).toEqual([
      'nowClass',
      'examCountdown',
      'todayChanges',
      'letusNews',
      'bulletins',
      'deadlines',
      'laterClasses',
      'entries',
    ])
  })

  it('examCountdown 登場前の保存値へ非破壊にマージされる（既存の順序・表示状態を保つ）', () => {
    // v103時点の既定順から「LETUS新着を非表示・締切を先頭へ」まで触ったユーザーの保存値。
    const saved: HomeSectionPref[] = [
      { key: 'deadlines', enabled: true },
      { key: 'nowClass', enabled: true },
      { key: 'todayChanges', enabled: false },
      { key: 'letusNews', enabled: false },
      { key: 'bulletins', enabled: true },
      { key: 'laterClasses', enabled: true },
      { key: 'entries', enabled: true },
    ]
    const out = normalizeHomeLayout(saved)
    // 新キーは既定順のアンカー（nowClassの直後）に入るだけで、既存キーの相対順序は不変。
    expect(out.map((s) => s.key)).toEqual([
      'deadlines',
      'nowClass',
      'examCountdown',
      'todayChanges',
      'letusNews',
      'bulletins',
      'laterClasses',
      'entries',
    ])
    expect(out.filter((s) => s.key !== 'examCountdown')).toEqual(saved)
    expect(out.find((s) => s.key === 'examCountdown')).toEqual({ key: 'examCountdown', enabled: true })
  })

  it('ユーザーが並び替えた保存値でも、欠けキーは既定順の前後関係を尊重して挿入される', () => {
    // bulletins を先頭へ移動済みのユーザー。letusNews は todayChanges の直後（bulletinsの上ではない
    // ＝ユーザーの並び替えを尊重しつつ既定順の「todayChangesより後」だけ満たす）。
    const saved = [
      { key: 'bulletins', enabled: true },
      { key: 'nowClass', enabled: true },
      { key: 'todayChanges', enabled: true },
      { key: 'deadlines', enabled: true },
      { key: 'laterClasses', enabled: true },
      { key: 'entries', enabled: true },
    ]
    const out = normalizeHomeLayout(saved)
    expect(out.map((s) => s.key)).toEqual([
      'bulletins',
      'nowClass',
      'examCountdown',
      'todayChanges',
      'letusNews',
      'deadlines',
      'laterClasses',
      'entries',
    ])
  })

  it('fixedOnキー(entries)はenabled=falseで保存されていても強制true', () => {
    const out = normalizeHomeLayout([{ key: 'entries', enabled: false }])
    expect(out.find((s) => s.key === 'entries')!.enabled).toBe(true)
  })

  it('既定は全キーをenabled=trueで既定順に含む', () => {
    expect(DEFAULT_HOME_LAYOUT.map((s) => s.key)).toEqual(HOME_SECTION_ORDER)
    expect(DEFAULT_HOME_LAYOUT.every((s) => s.enabled)).toBe(true)
  })

  it('既定順で letusNews は bulletins の直前（ユーザー指定: CLASS掲示の上）', () => {
    const i = HOME_SECTION_ORDER.indexOf('letusNews')
    expect(HOME_SECTION_ORDER[i + 1]).toBe('bulletins')
  })

  it('既定順で examCountdown は nowClass の直後（主役カードを上位に置く）', () => {
    expect(HOME_SECTION_ORDER.indexOf('examCountdown')).toBe(HOME_SECTION_ORDER.indexOf('nowClass') + 1)
  })
})

describe('moveSection', () => {
  // 既定順: [nowClass, examCountdown, todayChanges, letusNews, bulletins, deadlines, laterClasses, entries]
  const base: HomeSectionPref[] = DEFAULT_HOME_LAYOUT
  it('上へ移動（隣と入替）', () => {
    const out = moveSection(base, 'todayChanges', -1)
    expect(out.map((s) => s.key).slice(0, 3)).toEqual(['nowClass', 'todayChanges', 'examCountdown'])
  })
  it('下へ移動（隣と入替）', () => {
    const out = moveSection(base, 'nowClass', 1)
    expect(out.map((s) => s.key).slice(0, 2)).toEqual(['examCountdown', 'nowClass'])
  })
  it('先頭を上・末尾を下はそのまま', () => {
    expect(moveSection(base, 'nowClass', -1)).toEqual(base)
    expect(moveSection(base, 'entries', 1)).toEqual(base)
  })
  it('元配列を破壊しない', () => {
    const copy = base.map((s) => ({ ...s }))
    moveSection(base, 'todayChanges', -1)
    expect(base).toEqual(copy)
  })
})

describe('reorderHomeLayout', () => {
  // 既定順: [nowClass, examCountdown, todayChanges, letusNews, bulletins, deadlines, laterClasses, entries]
  const base: HomeSectionPref[] = DEFAULT_HOME_LAYOUT
  it('下へ移動（0→2）', () => {
    const out = reorderHomeLayout(base, 0, 2)
    expect(out.map((s) => s.key)).toEqual([
      'examCountdown',
      'todayChanges',
      'nowClass',
      'letusNews',
      'bulletins',
      'deadlines',
      'laterClasses',
      'entries',
    ])
  })
  it('上へ移動（3→0）', () => {
    const out = reorderHomeLayout(base, 3, 0)
    expect(out.map((s) => s.key)).toEqual([
      'letusNews',
      'nowClass',
      'examCountdown',
      'todayChanges',
      'bulletins',
      'deadlines',
      'laterClasses',
      'entries',
    ])
  })
  it('from==to は順序不変', () => {
    expect(reorderHomeLayout(base, 2, 2).map((s) => s.key)).toEqual(base.map((s) => s.key))
  })
  it('範囲外はクランプ（末尾へ / 先頭へ）', () => {
    const last = base.length - 1
    expect(reorderHomeLayout(base, 0, 99).map((s) => s.key)[last]).toBe('nowClass')
    expect(reorderHomeLayout(base, last, -5).map((s) => s.key)[0]).toBe('entries')
  })
  it('元配列を破壊しない', () => {
    const copy = base.map((s) => ({ ...s }))
    reorderHomeLayout(base, 0, 3)
    expect(base).toEqual(copy)
  })
})

describe('toggleSection', () => {
  it('表示/非表示を反転', () => {
    const out = toggleSection(DEFAULT_HOME_LAYOUT, 'deadlines')
    expect(out.find((s) => s.key === 'deadlines')!.enabled).toBe(false)
  })
  it('fixedOn(entries)は変更されない', () => {
    const out = toggleSection(DEFAULT_HOME_LAYOUT, 'entries')
    expect(out.find((s) => s.key === 'entries')!.enabled).toBe(true)
  })
})
