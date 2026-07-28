import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * 全データリセットの順序と耐障害性（監査M-3）。
 *
 * notifier / cookies はどちらもネイティブモジュールを遅延ロードする端末層なので、
 * ここでは丸ごとモックして resetAllData 自身の制御フローだけを固定する。
 * （実 notifier を読むと expo-constants / react-native を引き込んで node 環境で落ちる）
 */

const calls: string[] = []

const cancelAllScheduledNotifications = vi.fn(async () => {
  calls.push('cancelNotifications')
})
const clearAllCookies = vi.fn(async () => {
  calls.push('clearCookies')
})

vi.mock('../notifications/notifier', () => ({
  cancelAllScheduledNotifications: () => cancelAllScheduledNotifications(),
}))
vi.mock('./cookies', () => ({
  clearAllCookies: () => clearAllCookies(),
}))

const clear = vi.fn(async () => {
  calls.push('clearAll')
})
const getAllKeys = vi.fn(async () => ['demo:a', 'b'])
const multiRemove = vi.fn(async (keys: string[]) => {
  calls.push(`multiRemove:${keys.join(',')}`)
})
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    clear: () => clear(),
    getAllKeys: () => getAllKeys(),
    multiRemove: (keys: string[]) => multiRemove(keys),
  },
}))

import { resetAllData } from './resetAll'
import { setDemoNamespace } from './asyncStorage'

beforeEach(() => {
  calls.length = 0
  vi.clearAllMocks()
  cancelAllScheduledNotifications.mockImplementation(async () => {
    calls.push('cancelNotifications')
  })
  clearAllCookies.mockImplementation(async () => {
    calls.push('clearCookies')
  })
  setDemoNamespace(false)
})

describe('resetAllData（通常時）', () => {
  it('通知キャンセル → Cookie消去 → AsyncStorage全消去 の順に実行する', async () => {
    // 順序に意味がある。通知を先に消さないと AsyncStorage 消去後に古い予約が残り、
    // Cookie は AsyncStorage より先に消しておかないと、途中で落ちたときに
    // 「データは消えたのにログインは生きている」最悪の中間状態になる。
    await resetAllData()
    expect(calls).toEqual(['cancelNotifications', 'clearCookies', 'clearAll'])
  })

  it('Cookie消去が失敗しても AsyncStorage は必ず消える', async () => {
    // 端末譲渡時にデータが消えないことの方が実害が大きい。Cookieの失敗で止めない。
    clearAllCookies.mockRejectedValueOnce(new Error('cookie module unavailable'))

    await expect(resetAllData()).resolves.toBeUndefined()
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('通知キャンセルが失敗しても Cookie消去と AsyncStorage消去は実行する', async () => {
    cancelAllScheduledNotifications.mockRejectedValueOnce(new Error('no notifications module'))

    await expect(resetAllData()).resolves.toBeUndefined()
    expect(calls).toEqual(['clearCookies', 'clearAll'])
  })
})

describe('resetAllData（デモ中）', () => {
  it('デモ名前空間だけを消し、Cookie消去も通知キャンセルもしない', async () => {
    // デモは実ユーザーの端末上でも起動しうる。ここで Cookie を消すと、デモを触っただけで
    // 実ユーザーのLETUS / CLASS ログインが解除される。
    setDemoNamespace(true)

    await resetAllData()

    expect(clearAllCookies).not.toHaveBeenCalled()
    expect(cancelAllScheduledNotifications).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
    expect(calls).toEqual(['multiRemove:demo:a'])
  })
})
