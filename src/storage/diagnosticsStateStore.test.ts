import { describe, it, expect, beforeEach, vi } from 'vitest'

// AsyncStorage をモック（refreshMeta.test.ts と同方式）。ファサード経由の read-modify-write と
// デモ名前空間の振り替えを、実 Storage 実装を通して検証する。
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

import {
  loadDiagnosticsState,
  recordScanOutcome,
  recordScanCycleOutcome,
  DIAGNOSTICS_STATE_KEY,
} from './diagnosticsStateStore'
import { setDemoNamespace, DEMO_PREFIX } from './asyncStorage'
import { createScanAccumulator, type ScanDiagnosticsAccumulator } from '../health/scanDiagnostics'

const T0 = '2026-07-23T00:00:00.000Z'
const T1 = '2026-07-23T01:00:00.000Z'

describe('diagnosticsStateStore', () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach((k) => delete mockStore[k])
    setDemoNamespace(false)
  })

  it('キーは spec§5.1 の litus.diagnosticsState', () => {
    expect(DIAGNOSTICS_STATE_KEY).toBe('litus.diagnosticsState')
  })

  it('未保存は null（reducer に初回として渡る）', async () => {
    expect(await loadDiagnosticsState()).toBe(null)
  })

  it('recordScanOutcome が read-modify-write で状態を積み上げる（デバウンス）', async () => {
    const s1 = await recordScanOutcome({ codes: ['DASHBOARD_UNREADABLE'], at: T0 })
    expect(s1.consecutiveFailures).toBe(1)
    expect(s1.activeCodes).toEqual([])

    const s2 = await recordScanOutcome({ codes: ['DASHBOARD_UNREADABLE'], at: T1 })
    expect(s2.consecutiveFailures).toBe(2)
    expect(s2.activeCodes).toEqual(['DASHBOARD_UNREADABLE'])

    // 永続化されたものを読み戻せる
    expect(await loadDiagnosticsState()).toEqual(s2)
  })

  it('成功観測で回復して永続化される', async () => {
    await recordScanOutcome({ codes: ['LOGGED_OUT'], at: T0 })
    const good = await recordScanOutcome({ codes: [], at: T1 })
    expect(good.lastGoodAt).toBe(T1)
    expect(good.activeCodes).toEqual([])
    expect((await loadDiagnosticsState())?.lastGoodAt).toBe(T1)
  })

  it('デモ名前空間では demo: キーへ隔離され実データを壊さない', async () => {
    // 実データを1件書く
    await recordScanOutcome({ codes: [], at: T0 })
    const realRaw = mockStore[DIAGNOSTICS_STATE_KEY]
    expect(realRaw).toBeTruthy()

    // デモに入って書き込む
    setDemoNamespace(true)
    await recordScanOutcome({ codes: ['LOGGED_OUT'], at: T1 })
    expect(mockStore[`${DEMO_PREFIX}${DIAGNOSTICS_STATE_KEY}`]).toBeTruthy()
    // 実データは無傷
    expect(mockStore[DIAGNOSTICS_STATE_KEY]).toBe(realRaw)

    // デモを抜ければ実データがそのまま読める
    setDemoNamespace(false)
    const restored = await loadDiagnosticsState()
    expect(restored?.lastGoodAt).toBe(T0)
    expect(restored?.activeCodes).toEqual([])
  })

  describe('recordScanCycleOutcome（不完全サイクルの中立スキップ）', () => {
    it('reachedLetus=false は記録せず null を返す（lastGoodAt を誤更新しない）', async () => {
      const acc: ScanDiagnosticsAccumulator = createScanAccumulator() // reachedLetus=false
      const r = await recordScanCycleOutcome(acc, T0)
      expect(r).toBe(null)
      expect(await loadDiagnosticsState()).toBe(null) // 何も書かれていない
    })

    it('reachedLetus=true・hardコード無しは成功として lastGoodAt を更新する', async () => {
      const acc: ScanDiagnosticsAccumulator = { ...createScanAccumulator(), reachedLetus: true }
      const r = await recordScanCycleOutcome(acc, T0)
      expect(r?.lastGoodAt).toBe(T0)
      expect(r?.activeCodes).toEqual([])
      expect((await loadDiagnosticsState())?.lastGoodAt).toBe(T0)
    })

    it('reachedLetus=true・hardコード有りは失敗として畳み込む（横断集計込み）', async () => {
      const acc: ScanDiagnosticsAccumulator = {
        codes: ['DASHBOARD_UNREADABLE'],
        lostCourseCount: 2,
        trackedCourseCount: 3,
        reachedLetus: true,
      }
      const r = await recordScanCycleOutcome(acc, T0)
      // finalize が横断集計 COURSES_MAJORITY_LOST を加える。
      expect(r?.consecutiveFailures).toBe(1)
      expect(r?.lastCodes).toEqual(expect.arrayContaining(['DASHBOARD_UNREADABLE', 'COURSES_MAJORITY_LOST']))
    })
  })
})
