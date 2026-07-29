import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// AsyncStorage をモック（attendanceDoneStore.test.ts と同方式）。ファサード経由で
// デモ名前空間へ入ることまで含めて実装ごと検証する。
const mockStore: Record<string, string> = {}
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(mockStore[key] ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      mockStore[key] = value
      return Promise.resolve()
    }),
    removeItem: vi.fn((key: string) => {
      delete mockStore[key]
      return Promise.resolve()
    }),
  },
}))

import { seedDemoData } from './seedDemoData'
import { DEMO_TIMETABLE, DEMO_TIMETABLE_OVERRIDES } from './demoFixtures'
import { setDemoNamespace } from '../storage/asyncStorage'
import { loadTimetableOverrides } from '../storage/timetableOverridesStore'
import { loadTimetable } from '../storage/timetableStore'
import { applyQuarterOverrides, isQuarterSlot } from '../timetableEvents/quarter'

const NOW = new Date('2026-09-16T10:00:00+09:00')

describe('seedDemoData', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockStore)) delete mockStore[k]
    setDemoNamespace(true)
  })
  afterEach(() => setDemoNamespace(false))

  it('半期(前半/後半)指定をシードする（トグルを押しても何も変わらない状態にしない）', async () => {
    await seedDemoData(NOW)
    expect(await loadTimetableOverrides()).toEqual(DEMO_TIMETABLE_OVERRIDES)
  })

  it('シードした時間割に override を適用すると積みコマの2科目が前半/後半に割れる', async () => {
    await seedDemoData(NOW)
    const col = (await loadTimetable())![0]
    const overrides = await loadTimetableOverrides()
    const stacked = applyQuarterOverrides(col.slots, overrides).find(isQuarterSlot)!
    expect(stacked.classes.map((c) => c.quarter).sort()).toEqual(['first', 'second'])
  })

  it('書き込みは全てデモ名前空間へ入る（実データを汚さない）', async () => {
    await seedDemoData(NOW)
    expect(Object.keys(mockStore).length).toBeGreaterThan(0)
    for (const k of Object.keys(mockStore)) expect(k.startsWith('demo:')).toBe(true)
  })

  it('シードした時間割がデモ時間割そのもの', async () => {
    await seedDemoData(NOW)
    expect(await loadTimetable()).toEqual(DEMO_TIMETABLE)
  })
})
