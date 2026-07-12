import { describe, expect, it } from 'vitest'
import { KILL_SWITCH_URL, fetchKillSwitchStatus } from './killSwitchFetch'

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 })
}

describe('fetchKillSwitchStatus', () => {
  it('200＋正常JSONで正規化済みstatusを返す', async () => {
    const fetchImpl = async () => okResponse({ schemaVersion: 1, disabled: ['letus'], message: 'm' })
    const s = await fetchKillSwitchStatus(fetchImpl as typeof fetch)
    expect(s).toEqual({ disabledAll: false, disabled: ['letus'], message: 'm' })
  })

  it('KILL_SWITCH_URLへリクエストする', async () => {
    let requested: string | null = null
    const fetchImpl = async (input: RequestInfo | URL) => {
      requested = String(input)
      return okResponse({ disabled: [] })
    }
    await fetchKillSwitchStatus(fetchImpl as typeof fetch)
    expect(requested).toBe(KILL_SWITCH_URL)
  })

  it('非2xxはnull（呼び出し側がキャッシュ維持）', async () => {
    const fetchImpl = async () => new Response('not found', { status: 404 })
    expect(await fetchKillSwitchStatus(fetchImpl as typeof fetch)).toBeNull()
  })

  it('ネットワーク例外はnull', async () => {
    const fetchImpl = async () => {
      throw new TypeError('Network request failed')
    }
    expect(await fetchKillSwitchStatus(fetchImpl as typeof fetch)).toBeNull()
  })

  it('200でも本文がパース不能ならnull', async () => {
    const fetchImpl = async () => new Response('<!doctype html>', { status: 200 })
    expect(await fetchKillSwitchStatus(fetchImpl as typeof fetch)).toBeNull()
  })

  it('タイムアウトでnull（abortシグナルをfetchへ渡す）', async () => {
    const fetchImpl = (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    expect(await fetchKillSwitchStatus(fetchImpl as typeof fetch, 20)).toBeNull()
  })
})
