import { describe, it, expect, beforeEach, vi } from 'vitest'

const calls: string[] = []
const isAvailableAsync = vi.fn(async () => {
  calls.push('isAvailableAsync')
  return true
})
const requestReview = vi.fn(async () => {
  calls.push('requestReview')
})

vi.mock('expo-store-review', () => ({
  isAvailableAsync: () => isAvailableAsync(),
  requestReview: () => requestReview(),
}))

import { requestStoreReview } from './requestStoreReview'

describe('requestStoreReview', () => {
  beforeEach(() => {
    calls.length = 0
    isAvailableAsync.mockClear()
    requestReview.mockClear()
    isAvailableAsync.mockImplementation(async () => {
      calls.push('isAvailableAsync')
      return true
    })
    requestReview.mockImplementation(async () => {
      calls.push('requestReview')
    })
  })

  it('利用可能なら、記録（beforeRequest）を済ませてから requestReview を呼ぶ', async () => {
    const before = vi.fn(async () => {
      calls.push('beforeRequest')
      return true
    })
    await expect(requestStoreReview(before)).resolves.toBe('requested')
    expect(calls).toEqual(['isAvailableAsync', 'beforeRequest', 'requestReview'])
  })

  it('利用できない（isAvailableAsync が偽）なら、記録もしないし依頼もしない', async () => {
    isAvailableAsync.mockImplementation(async () => false)
    const before = vi.fn(async () => true)
    await expect(requestStoreReview(before)).resolves.toBe('unavailable')
    expect(before).not.toHaveBeenCalled()
    expect(requestReview).not.toHaveBeenCalled()
  })

  it('beforeRequest が false（前面でなくなった等）なら依頼しない', async () => {
    await expect(requestStoreReview(async () => false)).resolves.toBe('aborted')
    expect(requestReview).not.toHaveBeenCalled()
  })

  it('記録が例外になったら依頼しない（保存が壊れているなら出さない側へ）', async () => {
    await expect(
      requestStoreReview(async () => {
        throw new Error('storage down')
      }),
    ).resolves.toBe('error')
    expect(requestReview).not.toHaveBeenCalled()
  })

  it('isAvailableAsync が例外なら error で、記録も依頼もしない', async () => {
    isAvailableAsync.mockImplementation(async () => {
      throw new Error('native')
    })
    const before = vi.fn(async () => true)
    await expect(requestStoreReview(before)).resolves.toBe('error')
    expect(before).not.toHaveBeenCalled()
    expect(requestReview).not.toHaveBeenCalled()
  })

  it('requestReview が例外なら error（記録は済んでいる＝再試行しない側）', async () => {
    requestReview.mockImplementation(async () => {
      throw new Error('play core')
    })
    const before = vi.fn(async () => true)
    await expect(requestStoreReview(before)).resolves.toBe('error')
    expect(before).toHaveBeenCalledTimes(1)
  })
})

describe('requestStoreReview（ネイティブモジュールを読み込めない環境）', () => {
  it('モジュールの読み込みで例外になっても、アプリを落とさず error を返す', async () => {
    vi.resetModules()
    vi.doMock('expo-store-review', () => {
      throw new Error('Cannot find native module ExpoStoreReview')
    })
    const { requestStoreReview: fresh } = await import('./requestStoreReview')
    const before = vi.fn(async () => true)
    await expect(fresh(before)).resolves.toBe('error')
    expect(before).not.toHaveBeenCalled()
    vi.doUnmock('expo-store-review')
    vi.resetModules()
  })
})
