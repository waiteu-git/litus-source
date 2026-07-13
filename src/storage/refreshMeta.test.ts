import { describe, expect, it, beforeEach, vi } from 'vitest'
import { isTimetableStale, TIMETABLE_REFRESH_INTERVAL_MS, loadAssignmentsRefreshedAt, saveAssignmentsRefreshedAt } from './refreshMetaStore'

// AsyncStorage をモック
const mockStore: Record<string, string> = {}
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(mockStore[key] ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      mockStore[key] = value
      return Promise.resolve()
    }),
  },
}))

describe('isTimetableStale', () => {
  const now = 1_000_000_000_000
  it('未更新(0)は stale', () => {
    expect(isTimetableStale(0, now)).toBe(true)
  })
  it('間隔未満なら stale でない', () => {
    expect(isTimetableStale(now - (TIMETABLE_REFRESH_INTERVAL_MS - 1), now)).toBe(false)
  })
  it('間隔ちょうど/超過なら stale', () => {
    expect(isTimetableStale(now - TIMETABLE_REFRESH_INTERVAL_MS, now)).toBe(true)
    expect(isTimetableStale(now - TIMETABLE_REFRESH_INTERVAL_MS * 2, now)).toBe(true)
  })
})

describe('assignments refreshed at', () => {
  beforeEach(() => {
    // 各テスト前にモックストアをクリア
    Object.keys(mockStore).forEach(key => delete mockStore[key])
  })

  it('未保存は 0', async () => {
    expect(await loadAssignmentsRefreshedAt()).toBe(0)
  })

  it('保存した値を読み戻せる', async () => {
    await saveAssignmentsRefreshedAt(1234567890)
    expect(await loadAssignmentsRefreshedAt()).toBe(1234567890)
  })
})
