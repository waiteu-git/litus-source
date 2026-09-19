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
      { key: 'scheduleNotice', enabled: true },
      { key: 'nowClass', enabled: false },
      { key: 'unknownX', enabled: true },
      { key: 'scheduleNotice', enabled: true }, // 重複
    ]
    const out = normalizeHomeLayout(raw)
    // scheduleNotice(0)の直後にnowClassが既にあるのでそのまま。欠けたquickTilesは末尾に入る。
    expect(out.map((s) => s.key)).toEqual(['scheduleNotice', 'nowClass', 'quickTiles'])
    expect(out.find((s) => s.key === 'nowClass')!.enabled).toBe(false)
  })

  it('クイックタイル統合前（旧9キー）の保存値は、廃止7キーが黙って除かれ quickTiles が既定位置へ挿入される（2026-09-18裁定）', () => {
    // v215時点の既定順で保存されたレイアウト＝ユーザーがCLASS掲示を先頭へ動かし、LETUS新着をOFFにしていた例。
    const saved = [
      { key: 'bulletins', enabled: true },
      { key: 'nowClass', enabled: true },
      { key: 'scheduleNotice', enabled: true },
      { key: 'examCountdown', enabled: true },
      { key: 'todayChanges', enabled: true },
      { key: 'letusNews', enabled: false },
      { key: 'deadlines', enabled: true },
      { key: 'laterClasses', enabled: true },
      { key: 'entries', enabled: true },
    ]
    const out = normalizeHomeLayout(saved)
    // 廃止された7キー（bulletins/examCountdown/todayChanges/letusNews/deadlines/laterClasses/entries）は
    // 黙って除かれる。残るnowClass/scheduleNoticeの相対順序は保たれ、quickTilesはscheduleNoticeの直後
    // （既定順で自分より前にある最後の既存キーの直後）へ挿入される。
    expect(out.map((s) => s.key)).toEqual(['nowClass', 'scheduleNotice', 'quickTiles'])
    expect(out.find((s) => s.key === 'quickTiles')).toEqual({ key: 'quickTiles', enabled: true })
  })

  it('quickTilesはfixedOn=falseなので、保存値のenabled:falseがそのまま尊重される', () => {
    const saved: HomeSectionPref[] = [
      { key: 'nowClass', enabled: true },
      { key: 'scheduleNotice', enabled: true },
      { key: 'quickTiles', enabled: false },
    ]
    const out = normalizeHomeLayout(saved)
    expect(out.find((s) => s.key === 'quickTiles')!.enabled).toBe(false)
  })

  it('scheduleNoticeはfixedOn=trueなので、保存値でenabled:falseでも強制的にtrueになる', () => {
    const saved: HomeSectionPref[] = [
      { key: 'nowClass', enabled: true },
      { key: 'scheduleNotice', enabled: false },
      { key: 'quickTiles', enabled: true },
    ]
    const out = normalizeHomeLayout(saved)
    expect(out.find((s) => s.key === 'scheduleNotice')).toEqual({ key: 'scheduleNotice', enabled: true })
  })

  it('ユーザーが並び替えた保存値でも、既存キーの相対順序は保たれる', () => {
    const saved: HomeSectionPref[] = [
      { key: 'quickTiles', enabled: true },
      { key: 'nowClass', enabled: true },
    ]
    const out = normalizeHomeLayout(saved)
    // 欠けている scheduleNotice は「既定順で自分より前にある最後の既存キー」＝nowClassの直後へ。
    expect(out.map((s) => s.key)).toEqual(['quickTiles', 'nowClass', 'scheduleNotice'])
  })

  it('既定は全キーをenabled=trueで既定順に含む', () => {
    expect(DEFAULT_HOME_LAYOUT.map((s) => s.key)).toEqual(HOME_SECTION_ORDER)
    expect(DEFAULT_HOME_LAYOUT.every((s) => s.enabled)).toBe(true)
  })

  it('既定順で nowClass→scheduleNotice→quickTiles と並ぶ', () => {
    expect(HOME_SECTION_ORDER).toEqual(['nowClass', 'scheduleNotice', 'quickTiles'])
  })
})

describe('moveSection', () => {
  // 既定順: [nowClass, scheduleNotice, quickTiles]
  const base: HomeSectionPref[] = DEFAULT_HOME_LAYOUT

  it('上へ移動（隣と入替）', () => {
    const out = moveSection(base, 'quickTiles', -1)
    expect(out.map((s) => s.key)).toEqual(['nowClass', 'quickTiles', 'scheduleNotice'])
  })
  it('下へ移動（隣と入替）', () => {
    const out = moveSection(base, 'nowClass', 1)
    expect(out.map((s) => s.key)).toEqual(['scheduleNotice', 'nowClass', 'quickTiles'])
  })
  it('先頭を上・末尾を下はそのまま', () => {
    expect(moveSection(base, 'nowClass', -1)).toEqual(base)
    expect(moveSection(base, 'quickTiles', 1)).toEqual(base)
  })
  it('元配列を破壊しない', () => {
    const copy = base.map((s) => ({ ...s }))
    moveSection(base, 'quickTiles', -1)
    expect(base).toEqual(copy)
  })
})

describe('reorderHomeLayout', () => {
  // 既定順: [nowClass, scheduleNotice, quickTiles]
  const base: HomeSectionPref[] = DEFAULT_HOME_LAYOUT

  it('下へ移動（0→2）', () => {
    const out = reorderHomeLayout(base, 0, 2)
    expect(out.map((s) => s.key)).toEqual(['scheduleNotice', 'quickTiles', 'nowClass'])
  })
  it('上へ移動（2→0）', () => {
    const out = reorderHomeLayout(base, 2, 0)
    expect(out.map((s) => s.key)).toEqual(['quickTiles', 'nowClass', 'scheduleNotice'])
  })
  it('from==to は順序不変', () => {
    expect(reorderHomeLayout(base, 1, 1).map((s) => s.key)).toEqual(base.map((s) => s.key))
  })
  it('範囲外はクランプ（末尾へ / 先頭へ）', () => {
    const last = base.length - 1
    expect(reorderHomeLayout(base, 0, 99).map((s) => s.key)[last]).toBe('nowClass')
    expect(reorderHomeLayout(base, last, -5).map((s) => s.key)[0]).toBe('quickTiles')
  })
  it('元配列を破壊しない', () => {
    const copy = base.map((s) => ({ ...s }))
    reorderHomeLayout(base, 0, 2)
    expect(base).toEqual(copy)
  })
})

describe('toggleSection', () => {
  it('表示/非表示を反転', () => {
    const out = toggleSection(DEFAULT_HOME_LAYOUT, 'quickTiles')
    expect(out.find((s) => s.key === 'quickTiles')!.enabled).toBe(false)
  })
  it('fixedOn(scheduleNotice)は変更されない', () => {
    const out = toggleSection(DEFAULT_HOME_LAYOUT, 'scheduleNotice')
    expect(out.find((s) => s.key === 'scheduleNotice')!.enabled).toBe(true)
  })
})
