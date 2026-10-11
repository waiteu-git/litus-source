import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ANDROID_REVIEW_URL, IOS_REVIEW_URL, showStoreReviewLink, storeReviewUrl } from './storeReviewLink'

const appJson = JSON.parse(readFileSync(join(__dirname, '..', '..', 'app.json'), 'utf8')).expo as {
  android: { package: string }
  ios: { bundleIdentifier: string }
}

describe('storeReviewUrl（設定の常設リンクの行き先）', () => {
  it('iOS は App Store の「レビューを書く」へ直接開く恒久リンク（action=write-review）', () => {
    expect(storeReviewUrl('ios')).toBe(IOS_REVIEW_URL)
    expect(IOS_REVIEW_URL).toBe('https://apps.apple.com/jp/app/id6799900160?action=write-review')
  })

  it('Android は https の Play ストア掲載ページ（パッケージ名は app.json と一致）', () => {
    expect(storeReviewUrl('android')).toBe(ANDROID_REVIEW_URL)
    expect(ANDROID_REVIEW_URL).toBe(`https://play.google.com/store/apps/details?id=${appJson.android.package}`)
  })

  it('iOS の Bundle ID と Android のパッケージ名は同じ（両ストアで同じアプリを指す前提）', () => {
    expect(appJson.ios.bundleIdentifier).toBe(appJson.android.package)
  })

  it('market:// を使わない（Play ストアが無い端末で開けない）', () => {
    expect(IOS_REVIEW_URL).not.toContain('market://')
    expect(ANDROID_REVIEW_URL).not.toContain('market://')
    expect(ANDROID_REVIEW_URL.startsWith('https://')).toBe(true)
  })

  it('iOS・Android 以外（web など）は null＝リンクを出さない', () => {
    expect(storeReviewUrl('web')).toBeNull()
    expect(storeReviewUrl('windows')).toBeNull()
    expect(storeReviewUrl('')).toBeNull()
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
