import { beforeEach, describe, expect, it, vi } from 'vitest'

// AsyncStorage をモック（termsConsentStore.test.ts と同じ方式）。mockFailGet の間だけ読み取りを失敗させる。
const mockStore: Record<string, string> = {}
let mockFailGet = false
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn((key: string) =>
      mockFailGet ? Promise.reject(new Error('disk I/O error')) : Promise.resolve(mockStore[key] ?? null),
    ),
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

import { deserializeCelebrationChoice, serializeCelebrationChoice } from './celebrationSerialize'
import { loadCelebrationChoice, saveCelebrationChoice } from './celebrationStore'

describe('celebrationSerialize: 「on」「off」だけを通し、それ以外は未選択（null）', () => {
  it('往復', () => {
    expect(deserializeCelebrationChoice(serializeCelebrationChoice('on'))).toBe('on')
    expect(deserializeCelebrationChoice(serializeCelebrationChoice('off'))).toBe('off')
  })
  it.each([null, '', 'null', 'true', 'false', '1', '"ON"', '"yes"', '{"a":1}', '{broken', 'undefined'])(
    '壊れた/想定外の保存値 %j は未選択（null）',
    (raw) => {
      expect(deserializeCelebrationChoice(raw as string | null)).toBeNull()
    },
  )
})

describe('celebrationStore: 読めない時は投げずに未選択（null）を返す', () => {
  beforeEach(() => {
    mockFailGet = false
    for (const k of Object.keys(mockStore)) delete mockStore[k]
  })

  it('S1 未保存は null（＝更新後の初回起動はオンと読まれる）', async () => {
    expect(await loadCelebrationChoice()).toBeNull()
  })

  it('S2 保存した選択を読み戻す（モックが働いている陽性の対照）', async () => {
    await saveCelebrationChoice('off')
    expect(await loadCelebrationChoice()).toBe('off')
    await saveCelebrationChoice('on')
    expect(await loadCelebrationChoice()).toBe('on')
  })

  it('S3 読み取りが失敗しても投げずに null を返す（起動処理の catch に例外を届けない）', async () => {
    await saveCelebrationChoice('off')
    mockFailGet = true
    await expect(loadCelebrationChoice()).resolves.toBeNull()
  })

  it('S4 キーは催しの識別子を含む版つきの名前（将来の別の催しと混ざらない）', async () => {
    await saveCelebrationChoice('on')
    expect(Object.keys(mockStore).some((k) => /^celebration\.[a-z0-9-]+\.v1$/.test(k))).toBe(true)
  })
})
