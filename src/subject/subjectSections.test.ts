import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SUBJECT_LAYOUT,
  SUBJECT_SECTION_ORDER,
  normalizeSubjectLayout,
  moveSubjectSection,
  reorderSubjectLayout,
  toggleSubjectSection,
} from './subjectSections'

describe('normalizeSubjectLayout', () => {
  it('null/非配列は既定順・全enabledを返す', () => {
    expect(normalizeSubjectLayout(null)).toEqual(DEFAULT_SUBJECT_LAYOUT)
    expect(normalizeSubjectLayout('x')).toEqual(DEFAULT_SUBJECT_LAYOUT)
    expect(DEFAULT_SUBJECT_LAYOUT.map((s) => s.key)).toEqual(SUBJECT_SECTION_ORDER)
    expect(DEFAULT_SUBJECT_LAYOUT.every((s) => s.enabled)).toBe(true)
  })

  it('保存順を維持し、不明キー/重複を除去、欠けた既知キーをアンカー位置へ挿入', () => {
    const raw = [
      { key: 'attendance', enabled: false },
      { key: 'events', enabled: true },
      { key: 'zzz', enabled: true }, // 不明キー
      { key: 'attendance', enabled: true }, // 重複
    ]
    const out = normalizeSubjectLayout(raw)
    // 保存は [attendance, events]。欠けキー(updates/links/pattern)は既定順の前後関係を尊重して挿入される。
    expect(out.map((s) => s.key)).toEqual(['attendance', 'events', 'updates', 'links', 'pattern'])
    expect(out.find((s) => s.key === 'attendance')!.enabled).toBe(false)
  })

  it('links(fixedOn)はenabled=falseで保存されていても強制true（UpdateCheck等の導線を消さない）', () => {
    const out = normalizeSubjectLayout([{ key: 'links', enabled: false }])
    expect(out.find((s) => s.key === 'links')!.enabled).toBe(true)
  })
})

describe('subjectSections 操作', () => {
  const base = DEFAULT_SUBJECT_LAYOUT
  it('move 上/下/端', () => {
    expect(moveSubjectSection(base, 'updates', -1).map((s) => s.key).slice(0, 2)).toEqual(['updates', 'events'])
    expect(moveSubjectSection(base, 'events', 1).map((s) => s.key).slice(0, 2)).toEqual(['updates', 'events'])
    expect(moveSubjectSection(base, 'events', -1)).toEqual(base)
  })
  it('reorder 0→2 とクランプ', () => {
    expect(reorderSubjectLayout(base, 0, 2).map((s) => s.key)).toEqual(['updates', 'links', 'events', 'attendance', 'pattern'])
    expect(reorderSubjectLayout(base, 0, 99).map((s) => s.key)[4]).toBe('events')
  })
  it('toggle 表示/非表示反転', () => {
    expect(toggleSubjectSection(base, 'attendance').find((s) => s.key === 'attendance')!.enabled).toBe(false)
  })
})
