import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HOME_LAYOUT,
  HOME_SECTION_ORDER,
  normalizeHomeLayout,
  moveSection,
  toggleSection,
  type HomeSectionPref,
} from './homeSections'

describe('normalizeHomeLayout', () => {
  it('null/非配列は既定を返す', () => {
    expect(normalizeHomeLayout(null)).toEqual(DEFAULT_HOME_LAYOUT)
    expect(normalizeHomeLayout('x')).toEqual(DEFAULT_HOME_LAYOUT)
    expect(normalizeHomeLayout({})).toEqual(DEFAULT_HOME_LAYOUT)
  })

  it('保存順を維持し、欠けた既知キーを末尾に補い、不明キー/重複を除去', () => {
    const raw = [
      { key: 'deadlines', enabled: true },
      { key: 'nowClass', enabled: false },
      { key: 'unknownX', enabled: true },
      { key: 'deadlines', enabled: true }, // 重複
    ]
    const out = normalizeHomeLayout(raw)
    expect(out.map((s) => s.key)).toEqual([
      'deadlines',
      'nowClass',
      // 欠けていた既知キーが既定順(HOME_SECTION_ORDER)で末尾補完
      'todayChanges',
      'bulletins',
      'laterClasses',
      'entries',
    ])
    expect(out.find((s) => s.key === 'nowClass')!.enabled).toBe(false)
  })

  it('fixedOnキー(entries)はenabled=falseで保存されていても強制true', () => {
    const out = normalizeHomeLayout([{ key: 'entries', enabled: false }])
    expect(out.find((s) => s.key === 'entries')!.enabled).toBe(true)
  })

  it('既定は全キーをenabled=trueで既定順に含む', () => {
    expect(DEFAULT_HOME_LAYOUT.map((s) => s.key)).toEqual(HOME_SECTION_ORDER)
    expect(DEFAULT_HOME_LAYOUT.every((s) => s.enabled)).toBe(true)
  })
})

describe('moveSection', () => {
  // 既定順: [nowClass, todayChanges, bulletins, deadlines, laterClasses, entries]
  const base: HomeSectionPref[] = DEFAULT_HOME_LAYOUT
  it('上へ移動（隣と入替）', () => {
    const out = moveSection(base, 'todayChanges', -1)
    expect(out.map((s) => s.key).slice(0, 2)).toEqual(['todayChanges', 'nowClass'])
  })
  it('下へ移動（隣と入替）', () => {
    const out = moveSection(base, 'nowClass', 1)
    expect(out.map((s) => s.key).slice(0, 2)).toEqual(['todayChanges', 'nowClass'])
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
