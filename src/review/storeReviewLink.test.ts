import { afterAll, afterEach, describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// 行き先はビルド時の環境変数（src/config/endpoints.ts）。「設定あり」の値を import より先に入れる。
// 提供者の実値の形（https・action=write-review・パッケージ名の一致）は scripts/check-release-env.mjs が焼く前に検査する。
const TEST = vi.hoisted(() => {
  const ios = 'https://apps.example.com/app/id1?action=write-review'
  const android = 'https://play.example.com/store/apps/details?id=example.app'
  process.env.EXPO_PUBLIC_IOS_REVIEW_URL = ios
  process.env.EXPO_PUBLIC_ANDROID_REVIEW_URL = android
  return { ios, android }
})
afterAll(() => {
  delete process.env.EXPO_PUBLIC_IOS_REVIEW_URL
  delete process.env.EXPO_PUBLIC_ANDROID_REVIEW_URL
})

import { ANDROID_REVIEW_URL, IOS_REVIEW_URL, showStoreReviewLink, storeReviewUrl } from './storeReviewLink'

const appJson = JSON.parse(readFileSync(join(__dirname, '..', '..', 'app.json'), 'utf8')).expo as {
  android: { package: string }
  ios: { bundleIdentifier: string }
}

describe('storeReviewUrl（設定の常設リンクの行き先）', () => {
  it('iOS は EXPO_PUBLIC_IOS_REVIEW_URL の値', () => {
    expect(IOS_REVIEW_URL).toBe(TEST.ios)
    expect(storeReviewUrl('ios')).toBe(TEST.ios)
  })

  it('Android は EXPO_PUBLIC_ANDROID_REVIEW_URL の値', () => {
    expect(ANDROID_REVIEW_URL).toBe(TEST.android)
    expect(storeReviewUrl('android')).toBe(TEST.android)
  })

  it('iOS の Bundle ID と Android のパッケージ名は同じ（両ストアで同じアプリを指す前提）', () => {
    expect(appJson.ios.bundleIdentifier).toBe(appJson.android.package)
  })

  it('iOS・Android 以外（web など）は null＝リンクを出さない', () => {
    expect(storeReviewUrl('web')).toBeNull()
    expect(storeReviewUrl('windows')).toBeNull()
    expect(storeReviewUrl('')).toBeNull()
  })

  it('行き先が未設定（null）の OS では null＝評価の依頼を出さない', () => {
    expect(storeReviewUrl('ios', { ios: null, android: TEST.android })).toBeNull()
    expect(storeReviewUrl('android', { ios: TEST.ios, android: null })).toBeNull()
  })
})

describe('行き先の環境変数が未設定のビルド', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('両方とも空なら、既定の行き先でも iOS・Android とも null', async () => {
    vi.resetModules()
    vi.stubEnv('EXPO_PUBLIC_IOS_REVIEW_URL', '')
    vi.stubEnv('EXPO_PUBLIC_ANDROID_REVIEW_URL', '')
    const mod = await import('./storeReviewLink')
    expect(mod.storeReviewUrl('ios')).toBeNull()
    expect(mod.storeReviewUrl('android')).toBeNull()
  })
})

describe('showStoreReviewLink（設定の常設リンクを出す条件）', () => {
  it('production でデモでない時だけ出す', () => {
    expect(showStoreReviewLink('production', false)).toBe(true)
  })

  it('デモ中は出さない（まだ実際には使っていない）', () => {
    expect(showStoreReviewLink('production', true)).toBe(false)
  })

  it('ベータ・開発版は出さない（ストアに載らない）', () => {
    expect(showStoreReviewLink('beta', false)).toBe(false)
    expect(showStoreReviewLink('dev', false)).toBe(false)
  })
})
