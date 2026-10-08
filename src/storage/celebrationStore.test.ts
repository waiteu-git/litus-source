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

import {
  deserializeCardDismissed,
  deserializeCelebrationChoice,
  serializeCardDismissed,
  serializeCelebrationChoice,
} from './celebrationSerialize'
import {
  loadCelebrationCardDismissed,
  loadCelebrationChoice,
  saveCelebrationCardDismissed,
  saveCelebrationChoice,
} from './celebrationStore'

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

describe('celebrationSerialize（カードを閉じた記録）: true だけを通し、それ以外は false（閉じていない）', () => {
  it('往復', () => {
    expect(deserializeCardDismissed(serializeCardDismissed(true))).toBe(true)
    expect(deserializeCardDismissed(serializeCardDismissed(false))).toBe(false)
  })
  it.each([null, '', 'null', '1', '"true"', '"on"', '{"a":1}', '{broken', 'undefined', 'false'])(
    '壊れた/想定外の保存値 %j は false（カードが出る側へ倒れる）',
    (raw) => {
      expect(deserializeCardDismissed(raw as string | null)).toBe(false)
    },
  )
})

describe('celebrationStore（カードを閉じた記録）', () => {
  beforeEach(() => {
    mockFailGet = false
    for (const k of Object.keys(mockStore)) delete mockStore[k]
  })

  it('D1 未保存は false（閉じていない）', async () => {
    expect(await loadCelebrationCardDismissed()).toBe(false)
  })

  it('D2 閉じた記録を保存して読み戻せる／false で記録が消える（モックが働いている陽性の対照）', async () => {
    await saveCelebrationCardDismissed(true)
    expect(await loadCelebrationCardDismissed()).toBe(true)
    await saveCelebrationCardDismissed(false)
    expect(await loadCelebrationCardDismissed()).toBe(false)
    expect(Object.keys(mockStore)).toHaveLength(0)
  })

  it('D3 読み取りが失敗しても投げずに false を返す', async () => {
    await saveCelebrationCardDismissed(true)
    mockFailGet = true
    await expect(loadCelebrationCardDismissed()).resolves.toBe(false)
  })

  it('D4 選択（オン/オフ）とは別のキー。閉じても選択は変わらず、選択を保存しても閉じた記録は変わらない', async () => {
    await saveCelebrationChoice('on')
    await saveCelebrationCardDismissed(true)
    expect(await loadCelebrationChoice()).toBe('on')
    await saveCelebrationChoice('off')
    expect(await loadCelebrationCardDismissed()).toBe(true)
    expect(Object.keys(mockStore)).toHaveLength(2)
  })

  it('D5 キーは催しの識別子を含む版つきの名前（将来の別の催しに引き継がれない）', async () => {
    await saveCelebrationCardDismissed(true)
    expect(Object.keys(mockStore)[0]).toMatch(/^celebration\.soai-2026\.card-dismissed\.v1$/)
  })
})
