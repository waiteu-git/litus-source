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
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'node-html-parser'
import {
  createScanAccumulator,
  observeDashboard,
  type ScanDiagnosticsAccumulator,
} from '../health/scanDiagnostics'
import { parseMyCourses } from '../parsers/letusCourses'
import {
  MOODLE_FINGERPRINT_KEY,
  loadMoodleFingerprint,
  saveMoodleFingerprint,
} from './moodleFingerprintStore'

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
        ...createScanAccumulator(),
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

  describe('壊れた台帳の退役（実機で「バナーが消えない」の再現と修正）', () => {
    // 収集JSが送るのは `document.body.innerHTML`。Moodle の M.cfg は <head> にあるので
    // 送信HTMLには入らない＝HTMLだけを見ると健全なページを logged_in と判定できず、
    // reachedLetus が立たないまま「不完全サイクル」として **記録ごと捨てられる**。
    // 失敗側（パスワード欄）は body に在るので記録される⇒台帳は失敗しか書けない一方通行になり、
    // 一度 LOGGED_OUT が載ると健全に戻っても永久に消えない（実機 204/205 の症状）。
    const SANDBOX = 'https://school.moodledemo.net'
    const fullDoc = readFileSync(
      fileURLToPath(new URL('../parsers/__fixtures__/moodle52/my52_hydrated.html', import.meta.url)),
      'utf-8',
    )
    const bodyInner = parse(fullDoc).querySelector('body')?.innerHTML ?? ''

    /** 実機と同じ形（body.innerHTML ＋ ページ内報告）で健全な1サイクルを組む。 */
    function healthyCycle(pageSignals: { hasMcfg: boolean; loggedIn: boolean } | null) {
      const acc = createScanAccumulator()
      observeDashboard(acc, {
        html: bodyInner,
        courseAnchorCount: parseMyCourses(bodyInner, SANDBOX).length,
        knownCourseCount: 5,
        pageSignals,
      })
      return acc
    }

    /** 壊れていた頃（204/205）に書かれた台帳を投入する。 */
    async function seedBrokenState() {
      await recordScanOutcome({ codes: ['LOGGED_OUT'], at: T0 })
      const seeded = await loadDiagnosticsState()
      expect(seeded?.activeCodes).toEqual(['LOGGED_OUT'])
      return seeded
    }

    it('壊れた状態を投入しても、健全なサイクル1回で LOGGED_OUT が退役する', async () => {
      await seedBrokenState()
      const next = await recordScanCycleOutcome(healthyCycle({ hasMcfg: true, loggedIn: true }), T1)
      expect(next).not.toBeNull()
      expect(next?.activeCodes).toEqual([])
      expect(next?.consecutiveFailures).toBe(0)
      expect(next?.lastGoodAt).toBe(T1)
      // 画面が読むのは storage の値なので、永続側も退役していること。
      expect((await loadDiagnosticsState())?.activeCodes).toEqual([])
    })

    it('ページ内報告が無いと健全でも記録されない＝壊れた台帳が残り続ける（退役が効く根拠）', async () => {
      const seeded = await seedBrokenState()
      // 報告なし＝HTML から推定するしかなく、body.innerHTML に M.cfg が無いので unknown に倒れる。
      expect(await recordScanCycleOutcome(healthyCycle(null), T1)).toBeNull()
      expect(await loadDiagnosticsState()).toEqual(seeded)
    })

    it('健全なサイクルが NOT_A_MOODLE_PAGE を新たに出さない（報告を hasMcfg にも通している）', async () => {
      const next = await recordScanCycleOutcome(healthyCycle({ hasMcfg: true, loggedIn: true }), T1)
      expect(next?.lastCodes).toEqual([])
    })
  })

  describe('受動版フィンガープリント（§9・T8）の相乗り保存', () => {
    it('版が読めたサイクルは観測を保存する（診断台帳の記録と同じエントリで1回だけ）', async () => {
      const acc: ScanDiagnosticsAccumulator = {
        ...createScanAccumulator(),
        reachedLetus: true,
        fingerprint: { version: { major: 5, minor: 2 }, bodyClasses: ['format-topics'], bs5: true },
      }
      await recordScanCycleOutcome(acc, T0)
      expect(await loadMoodleFingerprint()).toEqual({
        version: { major: 5, minor: 2 },
        bs5: true,
        observedAt: T0,
      })
    })

    it('版が読めなかったサイクルは既存の観測を消さない（last-good 維持）', async () => {
      await saveMoodleFingerprint({ version: { major: 4, minor: 5 }, bs5: false, observedAt: T0 })
      const acc: ScanDiagnosticsAccumulator = { ...createScanAccumulator(), reachedLetus: true }
      await recordScanCycleOutcome(acc, T1)
      expect((await loadMoodleFingerprint())?.version).toEqual({ major: 4, minor: 5 })
    })

    it('不完全サイクル（reachedLetus=false）でも、読めた観測は保存する（診断ゲートとは独立）', async () => {
      const acc: ScanDiagnosticsAccumulator = {
        ...createScanAccumulator(),
        fingerprint: { version: { major: 4, minor: 5 }, bodyClasses: [], bs5: false },
      }
      expect(await recordScanCycleOutcome(acc, T0)).toBe(null) // 台帳は記録しない
      expect((await loadMoodleFingerprint())?.version).toEqual({ major: 4, minor: 5 })
    })

    it('bodyClasses は永続しない（ページ毎に揺れる一時情報）', async () => {
      const acc: ScanDiagnosticsAccumulator = {
        ...createScanAccumulator(),
        reachedLetus: true,
        fingerprint: { version: { major: 5, minor: 0 }, bodyClasses: ['page-mycourses'], bs5: true },
      }
      await recordScanCycleOutcome(acc, T0)
      expect(mockStore[MOODLE_FINGERPRINT_KEY]).not.toContain('page-mycourses')
    })
  })
})
