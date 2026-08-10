import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..')
const appJson = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'))

/**
 * 輸出コンプライアンス（App Store Connect「アプリの暗号化に関する書類」）の申告。
 *
 * 未設定だと **TestFlight へ上げるたび・提出のたび**に画面で手動回答を求められ、
 * 答え忘れるとビルドが「処理中」から進まない。`Info.plist` に持たせれば以後聞かれない。
 *
 * 値が `false` で正しい根拠: リタスの暗号化は HTTPS(TLS) のみ＝Apple の免除対象で、
 * 独自の暗号アルゴリズムは持たない（`usesCleartextTraffic: false` で全通信先が HTTPS）。
 * `false` は「暗号化を使っていない」ではなく「**非免除の**暗号化を使っていない」の意味なので、
 * HTTPS のみのアプリはこれで正しい。
 *
 * ⚠ この値は `expo prebuild` を通らないと `Info.plist` に1バイトも反映されない。
 *   成果物側（生成された `ios/app/Info.plist`）で必ず確認すること。
 */
describe('iOS の輸出コンプライアンス申告', () => {
  it('ios.infoPlist に ITSAppUsesNonExemptEncryption がある（無いと提出のたびに手動回答が要る）', () => {
    expect(typeof appJson.expo.ios.infoPlist?.ITSAppUsesNonExemptEncryption).toBe('boolean')
  })

  it('ITSAppUsesNonExemptEncryption が false（HTTPS のみ＝免除対象）', () => {
    // 文字列 "false" だと `<string>false</string>` として焼かれ、申告として成立しない
    // （真偽値でしか `<false/>` にならない）ので、型と値の両方を固定する。
    expect(appJson.expo.ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false)
  })
})
