import { describe, it, expect, beforeEach, vi } from 'vitest'

// AsyncStorage をモック（diagnosticsStateStore.test.ts と同方式）。ファサード経由の
// read-modify-write を実 Storage 実装ごと検証する。
const mockStore: Record<string, string> = {}
const setItem = vi.fn((key: string, value: string) => {
  mockStore[key] = value
  return Promise.resolve()
})
const getItem = vi.fn((key: string): Promise<string | null> => Promise.resolve(mockStore[key] ?? null))
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string) => getItem(key),
    setItem: (key: string, value: string) => setItem(key, value),
    removeItem: vi.fn((key: string) => {
      delete mockStore[key]
      return Promise.resolve()
    }),
  },
}))

import { REVIEW_STATE_KEY, loadReviewState, mutateReviewState } from './reviewStateStore'
import { setDemoNamespace } from './asyncStorage'
import {
  DAY_MS,
  EMPTY_REVIEW_STATE,
  addValueDay,
  parseReviewState,
  serializeReviewState,
  type ReviewState,
} from '../review/reviewState'

const NOW = new Date(2026, 9, 1, 12, 0, 0).getTime()

const stored = (): ReviewState => {
  const raw = mockStore[REVIEW_STATE_KEY]
  expect(raw).toBeDefined()
  return parseReviewState(raw, NOW).state
}

describe('reviewStateStore', () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach((k) => delete mockStore[k])
    setItem.mockClear()
    getItem.mockClear()
    getItem.mockImplementation((key: string) => Promise.resolve(mockStore[key] ?? null))
    setDemoNamespace(false)
  })

  it('未保存は fresh の空の状態を返し、何も書かない', async () => {
    const r = await loadReviewState(NOW)
    expect(r).toEqual({ state: EMPTY_REVIEW_STATE, health: 'fresh' })
    expect(setItem).not.toHaveBeenCalled()
  })

  it('壊れた保存は「今が初回・今が直近の依頼」へ直して書き戻す（次からは ok）', async () => {
    mockStore[REVIEW_STATE_KEY] = '{oops'
    const first = await loadReviewState(NOW)
    expect(first.health).toBe('corrupt')
    expect(first.state.firstSeenAt).toBe(NOW)
    expect(first.state.requests).toEqual([NOW])
    expect(stored().requests).toEqual([NOW])

    const second = await loadReviewState(NOW + DAY_MS)
    expect(second.health).toBe('ok')
    expect(second.state.firstSeenAt).toBe(NOW)
  })

  it('未来の時刻が残っていたら、今へ丸めて書き戻す（時計ずれで待ちが永続しない）。丸めた後は書かない', async () => {
    const FUTURE = NOW + 400 * DAY_MS
    mockStore[REVIEW_STATE_KEY] = JSON.stringify({
      ...EMPTY_REVIEW_STATE,
      firstSeenAt: FUTURE,
      lastFailureAt: FUTURE,
      requests: [FUTURE],
    })
    const first = await loadReviewState(NOW)
    expect(first.health).toBe('ok')
    expect(first.state.firstSeenAt).toBe(NOW)
    // 保存された生の JSON で確かめる（stored() は読む側でも丸めるので、書き戻しの有無を区別できない）
    const raw = JSON.parse(mockStore[REVIEW_STATE_KEY])
    expect(raw.firstSeenAt).toBe(NOW)
    expect(raw.lastFailureAt).toBe(NOW)
    expect(raw.requests).toEqual([NOW])

    setItem.mockClear()
    await loadReviewState(NOW + DAY_MS)
    expect(setItem).not.toHaveBeenCalled()
  })

  it('正規形の保存は、読むだけでは書き戻さない（書き込みの増幅を起こさない）', async () => {
    mockStore[REVIEW_STATE_KEY] = serializeReviewState({ ...EMPTY_REVIEW_STATE, firstSeenAt: NOW - DAY_MS, valueDays: ['20260930'] })
    await loadReviewState(NOW)
    await loadReviewState(NOW)
    expect(setItem).not.toHaveBeenCalled()
  })

  it('mutate は変えた時だけ書き、同じオブジェクトを返す変更では書かない', async () => {
    const r1 = await mutateReviewState(NOW, (s) => ({ ...s, firstSeenAt: NOW }))
    expect(r1.state.firstSeenAt).toBe(NOW)
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(stored().firstSeenAt).toBe(NOW)

    setItem.mockClear()
    const r2 = await mutateReviewState(NOW, (s) => s)
    expect(r2.state.firstSeenAt).toBe(NOW)
    expect(setItem).not.toHaveBeenCalled()
  })

  it('価値日を足す変更は1日1件で、同じ日の再実行では書かない', async () => {
    await mutateReviewState(NOW, (s) => addValueDay(s, '20261001'))
    expect(stored().valueDays).toEqual(['20261001'])
    setItem.mockClear()
    await mutateReviewState(NOW, (s) => addValueDay(s, '20261001'))
    expect(setItem).not.toHaveBeenCalled()
  })

  it('同時に走らせた変更は直列に適用され、どちらも失われない', async () => {
    await Promise.all([
      mutateReviewState(NOW, (s) => addValueDay(s, '20260930')),
      mutateReviewState(NOW, (s) => addValueDay(s, '20261001')),
      mutateReviewState(NOW, (s) => ({ ...s, lastFailureAt: 42 })),
    ])
    const s = stored()
    expect(s.valueDays).toEqual(['20260930', '20261001'])
    expect(s.lastFailureAt).toBe(42)
  })

  it('読み取りが例外になった時は書かずに reject し、次の変更は通常どおり動く（鎖が壊れない）', async () => {
    getItem.mockImplementationOnce(() => Promise.reject(new Error('storage down')))
    await expect(mutateReviewState(NOW, (s) => ({ ...s, firstSeenAt: NOW }))).rejects.toThrow('storage down')
    expect(setItem).not.toHaveBeenCalled()

    const ok = await mutateReviewState(NOW, (s) => ({ ...s, firstSeenAt: NOW }))
    expect(ok.state.firstSeenAt).toBe(NOW)
    expect(stored().firstSeenAt).toBe(NOW)
  })

  it('変更関数が例外になった時も書かず、次の変更は通常どおり動く', async () => {
    await expect(
      mutateReviewState(NOW, () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(setItem).not.toHaveBeenCalled()
    await expect(mutateReviewState(NOW, (s) => ({ ...s, firstSeenAt: NOW }))).resolves.toBeDefined()
  })

  it('保存はファサード経由＝デモ名前空間では実キーに触れない', async () => {
    setDemoNamespace(true)
    await mutateReviewState(NOW, (s) => ({ ...s, firstSeenAt: NOW }))
    expect(mockStore[`demo:${REVIEW_STATE_KEY}`]).toBeDefined()
    expect(mockStore[REVIEW_STATE_KEY]).toBeUndefined()
    setDemoNamespace(false)
  })

  it('保存した内容は serialize 済みの形式（review.state.v1）', async () => {
    const s: ReviewState = { ...EMPTY_REVIEW_STATE, firstSeenAt: NOW, valueDays: ['20261001'] }
    await mutateReviewState(NOW, () => s)
    expect(mockStore[REVIEW_STATE_KEY]).toBe(serializeReviewState(s))
    expect(REVIEW_STATE_KEY).toBe('review.state.v1')
  })
})
