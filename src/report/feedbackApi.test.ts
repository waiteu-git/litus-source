import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import type { FeedbackEnvelope } from './feedback'

// 送信先はビルド時の環境変数（src/config/endpoints.ts）。「設定あり」の値を import より先に入れる。
const TEST_URL = vi.hoisted(() => {
  const url = 'https://api.example.com/api/feedback'
  process.env.EXPO_PUBLIC_FEEDBACK_URL = url
  return url
})
afterAll(() => {
  delete process.env.EXPO_PUBLIC_FEEDBACK_URL
})

import { submitFeedback } from './feedbackApi'

const ENVELOPE: FeedbackEnvelope = {
  kind: 'request',
  target: null,
  comment: 'テスト',
  email: null,
  diagsText: null,
  notifLine: null,
  env: {
    appVersion: '1.0.3',
    buildNumber: '215',
    releaseStage: 'production',
    os: 'Android',
    osVersion: '15',
    device: 'Pixel',
  },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('submitFeedback', () => {
  it('200なら ok:true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    expect(await submitFeedback(ENVELOPE)).toEqual({ ok: true })
  })

  it('非2xxなら ok:false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }))
    expect(await submitFeedback(ENVELOPE)).toEqual({ ok: false })
  })

  it('fetchが例外を投げても ok:false（自宅鯖が落ちていても呼び出し側を壊さない）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    expect(await submitFeedback(ENVELOPE)).toEqual({ ok: false })
  })

  it('POST先とペイロードが正しい', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    await submitFeedback(ENVELOPE)
    expect(fetchMock).toHaveBeenCalledWith(
      TEST_URL,
      expect.objectContaining({ method: 'POST' }),
    )
    const [, opts] = fetchMock.mock.calls[0]
    expect(JSON.parse(opts.body)).toEqual({
      kind: 'request',
      target: null,
      comment: 'テスト',
      email: '',
      diagsText: null,
      notifLine: null,
      env: ENVELOPE.env,
    })
  })

  it('タイムアウト用のAbortSignalを渡す', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    await submitFeedback(ENVELOPE)
    const [, opts] = fetchMock.mock.calls[0]
    expect(opts.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('送信先が未設定のビルド', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('引数で null を渡すと通信せず ok:false', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    expect(await submitFeedback(ENVELOPE, null)).toEqual({ ok: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('EXPO_PUBLIC_FEEDBACK_URL が空なら、既定の送信先でも通信せず ok:false', async () => {
    vi.resetModules()
    vi.stubEnv('EXPO_PUBLIC_FEEDBACK_URL', '')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const mod = await import('./feedbackApi')
    expect(mod.FEEDBACK_ENDPOINT).toBeNull()
    expect(await mod.submitFeedback(ENVELOPE)).toEqual({ ok: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
