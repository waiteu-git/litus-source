import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..')
const appJson = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'))

/**
 * iOS の `CFBundleVersion` は Expo 既定で `1` 固定になる（`ios.buildNumber` 未設定時の実測）。
 * App Store Connect は**アップロードごとに一意のビルド番号**を要求するので、2本目の提出が弾かれる。
 *
 * 版数は Android の `versionCode` と1本に揃える。番号体系を2つ持つと版の取り違えが起きるため
 * （スタブAPK4本の配布・detached HEAD で版を偽りかけた事故が実際に起きている）。
 *
 * ⚠ この値は `expo prebuild` を通らないと `Info.plist` に1バイトも反映されない。
 *   成果物側（生成された `Info.plist` の `CFBundleVersion`）で必ず確認すること。
 */
describe('iOS のビルド番号は Android の versionCode と同じ', () => {
  it('ios.buildNumber が設定されている（未設定だと CFBundleVersion=1 固定で2本目の提出が弾かれる）', () => {
    expect(typeof appJson.expo.ios.buildNumber).toBe('string')
  })

  it('ios.buildNumber と android.versionCode が一致する', () => {
    expect(appJson.expo.ios.buildNumber).toBe(String(appJson.expo.android.versionCode))
  })
})
