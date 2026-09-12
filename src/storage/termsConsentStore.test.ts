import { beforeEach, describe, expect, it, vi } from 'vitest'

// AsyncStorage をモック（diagnosticsStateStore.test.ts と同じ方式）。mockFailGet の間だけ読み取りを失敗させる。
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

import { loadAcceptedTermsVersion, saveTermsConsent } from './termsConsentStore'

describe('🔴 規約の同意済みの版は、読めない時に未同意（0）として返す（設計 PC）', () => {
  beforeEach(() => {
    mockFailGet = false
    for (const k of Object.keys(mockStore)) delete mockStore[k]
  })

  it('S1 保存した版を読み戻す（モックが働いている陽性の対照）', async () => {
    await saveTermsConsent(3)
    expect(await loadAcceptedTermsVersion()).toBe(3)
  })

  it('S2 未保存は 0（未同意）', async () => {
    expect(await loadAcceptedTermsVersion()).toBe(0)
  })

  it('S3 読み取りが失敗しても投げずに 0 を返す（投げると起動処理の catch が規約画面を飛ばして checking へ進む）', async () => {
    await saveTermsConsent(3)
    mockFailGet = true
    await expect(loadAcceptedTermsVersion()).resolves.toBe(0)
  })
})
