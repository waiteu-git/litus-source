import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

/**
 * Cookie消去ラッパの no-op フォールバック（監査M-3）。
 *
 * ここで守っているのは「**リセットを壊さないこと**」。Cookieモジュールは
 * TurboModuleRegistry.getEnforcing でネイティブ実装を取りに行くため、Expo Go や
 * 未搭載ビルドでは import しただけで throw する。それが全データリセットまで
 * 巻き添えにすると、ユーザーはデータを消せなくなる。
 *
 * モジュールレベルの状態（IS_EXPO_GO / キャッシュ）を条件ごとに作り直す必要があるので、
 * vi.resetModules() + doMock + 動的 import で毎回まっさらに読み込む。
 */

const STORE_CLIENT = { StoreClient: 'storeClient', Bare: 'bare', Standalone: 'standalone' }

function mockConstants(executionEnvironment: string) {
  vi.doMock('expo-constants', () => ({
    default: { executionEnvironment },
    ExecutionEnvironment: STORE_CLIENT,
  }))
}

async function importFresh() {
  return import('./cookies')
}

beforeEach(() => {
  vi.resetModules()
  vi.doUnmock('@preeternal/react-native-cookie-manager')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('clearAllCookies', () => {
  it('通常ビルドでは clearAllStores を呼ぶ（clearAll ではない）', async () => {
    // clearAll(useWebKit=false) は iOS で Foundation のストアしか消さず、WKWebView に
    // 残ったSSOセッションが生き残る。両ストアを消す clearAllStores でなければならない。
    const clearAllStores = vi.fn(() => Promise.resolve(true))
    const clearAll = vi.fn(() => Promise.resolve(true))
    mockConstants('bare')
    vi.doMock('@preeternal/react-native-cookie-manager', () => ({
      default: { clearAllStores, clearAll },
    }))

    const { clearAllCookies } = await importFresh()
    await clearAllCookies()

    expect(clearAllStores).toHaveBeenCalledTimes(1)
    expect(clearAll).not.toHaveBeenCalled()
  })

  it('Expo Go ではモジュールを読み込まずに no-op で成功する', async () => {
    const clearAllStores = vi.fn(() => Promise.resolve(true))
    mockConstants(STORE_CLIENT.StoreClient)
    vi.doMock('@preeternal/react-native-cookie-manager', () => ({
      default: { clearAllStores },
    }))

    const { clearAllCookies } = await importFresh()
    await expect(clearAllCookies()).resolves.toBeUndefined()

    expect(clearAllStores).not.toHaveBeenCalled()
  })

  it('モジュールのロードに失敗しても no-op で成功する（未搭載ビルド）', async () => {
    mockConstants('bare')
    vi.doMock('@preeternal/react-native-cookie-manager', () => {
      throw new Error('getEnforcing: CookieManager could not be found')
    })

    const { clearAllCookies } = await importFresh()
    await expect(clearAllCookies()).resolves.toBeUndefined()
  })

  it('ネイティブ側が reject しても no-op で成功する', async () => {
    const clearAllStores = vi.fn(() => Promise.reject(new Error('clear_all_error')))
    mockConstants('bare')
    vi.doMock('@preeternal/react-native-cookie-manager', () => ({
      default: { clearAllStores },
    }))

    const { clearAllCookies } = await importFresh()
    await expect(clearAllCookies()).resolves.toBeUndefined()

    expect(clearAllStores).toHaveBeenCalledTimes(1)
  })

  it('ロード失敗はキャッシュされ、2回目は再ロードしない', async () => {
    let loads = 0
    mockConstants('bare')
    vi.doMock('@preeternal/react-native-cookie-manager', () => {
      loads += 1
      throw new Error('unavailable')
    })

    const { clearAllCookies } = await importFresh()
    await clearAllCookies()
    await clearAllCookies()

    expect(loads).toBe(1)
  })
})
