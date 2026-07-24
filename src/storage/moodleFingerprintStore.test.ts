import { describe, it, expect, beforeEach, vi } from 'vitest'

// AsyncStorage をモック（diagnosticsStateStore.test.ts と同方式）。ファサード経由の読み書きと
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
  MOODLE_FINGERPRINT_KEY,
  deserializeMoodleFingerprint,
  loadMoodleFingerprint,
  saveMoodleFingerprint,
  serializeMoodleFingerprint,
} from './moodleFingerprintStore'
import { setDemoNamespace, DEMO_PREFIX } from './asyncStorage'

const T0 = '2026-07-24T00:00:00.000Z'

describe('moodleFingerprintStore', () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach((k) => delete mockStore[k])
    setDemoNamespace(false)
  })

  it('保存キーは litus.moodleFingerprint', () => {
    expect(MOODLE_FINGERPRINT_KEY).toBe('litus.moodleFingerprint')
  })

  it('保存した観測をそのまま読み戻せる', async () => {
    await saveMoodleFingerprint({ version: { major: 5, minor: 2 }, bs5: true, observedAt: T0 })
    expect(await loadMoodleFingerprint()).toEqual({
      version: { major: 5, minor: 2 },
      bs5: true,
      observedAt: T0,
    })
  })

  it('未保存は null（未観測扱い）', async () => {
    expect(await loadMoodleFingerprint()).toBeNull()
  })

  it('bs5 は保存値でなく version から再導出する（保存時と読出時で判定がずれない）', () => {
    // 壊れた/古い保存（version は 5.x なのに bs5=false）でも読出時に true へ正す。
    const raw = JSON.stringify({ version: { major: 5, minor: 0 }, bs5: false, observedAt: T0 })
    expect(deserializeMoodleFingerprint(raw)?.bs5).toBe(true)
    const raw45 = JSON.stringify({ version: { major: 4, minor: 5 }, bs5: true, observedAt: T0 })
    expect(deserializeMoodleFingerprint(raw45)?.bs5).toBe(false)
  })

  it('壊れた保存値は null（未観測扱いへ倒す）', () => {
    const cases: Array<[string, string | null]> = [
      ['null', null],
      ['空文字', ''],
      ['壊れJSON', '{'],
      ['配列', '[]'],
      ['スカラ', '"5.2"'],
      ['version 欠落', JSON.stringify({ bs5: true, observedAt: T0 })],
      ['observedAt 欠落', JSON.stringify({ version: { major: 5, minor: 2 }, bs5: true })],
      ['version が非オブジェクト', JSON.stringify({ version: 502, observedAt: T0 })],
      ['major が文字列', JSON.stringify({ version: { major: '5', minor: 2 }, observedAt: T0 })],
      ['minor が小数', JSON.stringify({ version: { major: 5, minor: 2.5 }, observedAt: T0 })],
      ['major が負', JSON.stringify({ version: { major: -5, minor: 2 }, observedAt: T0 })],
    ]
    for (const [name, raw] of cases) {
      expect(deserializeMoodleFingerprint(raw), name).toBeNull()
    }
  })

  it('serialize→deserialize は往復する', () => {
    const value = { version: { major: 4, minor: 5 }, bs5: false, observedAt: T0 }
    expect(deserializeMoodleFingerprint(serializeMoodleFingerprint(value))).toEqual(value)
  })

  it('デモ中の書き込みは demo: 名前空間へ振り替わり実データを壊さない', async () => {
    await saveMoodleFingerprint({ version: { major: 4, minor: 5 }, bs5: false, observedAt: T0 })
    const realRaw = mockStore[MOODLE_FINGERPRINT_KEY]

    setDemoNamespace(true)
    expect(await loadMoodleFingerprint()).toBeNull() // デモ名前空間は空
    await saveMoodleFingerprint({ version: { major: 5, minor: 2 }, bs5: true, observedAt: T0 })
    expect(mockStore[`${DEMO_PREFIX}${MOODLE_FINGERPRINT_KEY}`]).toBeDefined()
    expect(mockStore[MOODLE_FINGERPRINT_KEY]).toBe(realRaw) // 実データは無傷

    setDemoNamespace(false)
    expect((await loadMoodleFingerprint())?.version).toEqual({ major: 4, minor: 5 })
  })
})
