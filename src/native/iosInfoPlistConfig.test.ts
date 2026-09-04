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

/**
 * App Store 掲載の「言語」欄が英語（EN）になる不具合の対処（211 積み荷④）。
 * 原因: ASC の設定ではなく `.app` バンドルの中身（`CFBundleLocalizations` /
 * `CFBundleDevelopmentRegion`）で決まる。実測でこれが未宣言だった
 * （`itunes.apple.com/jp/lookup?id=6799900160` の languageCodesISO2A が ['EN']）。
 *
 * 🔴 これは掲載表示だけの問題ではない。実行時のシステムUI言語選択にも効く
 * （同じ根本原因が `src/ui/DateTimeSheet.tsx` の日付ピッカー英語化を既に一度起こしている）。
 *
 * ⚠ このテストが守れるのは「app.json に宣言が在ること」だけ。
 *   宣言が消えていないことのラチェットに過ぎず、次を一切保証しない:
 *   - 実機での挙動（システムUIが実際に日本語になるか）
 *   - App Store 掲載の言語欄（211 がストアに出るまで確認できない。ASC を触っても変わらない）
 *   このテストが緑でも、掲載が英語のままである可能性は残る。
 *
 * ⚠ この値は `expo prebuild` を通らないと `Info.plist` に1バイトも反映されない。
 *   成果物側（生成された `ios/app/Info.plist`）で必ず確認すること。
 * 設計: docs/design/2026-09-03-ios-bundle-localizations.md
 */
describe('iOS バンドルの言語宣言（App Store 掲載言語対策）', () => {
  it('ios.infoPlist.CFBundleLocalizations に ja が含まれる', () => {
    expect(appJson.expo.ios.infoPlist?.CFBundleLocalizations).toContain('ja')
  })

  it('ios.infoPlist.CFBundleDevelopmentRegion が ja', () => {
    expect(appJson.expo.ios.infoPlist?.CFBundleDevelopmentRegion).toBe('ja')
  })
})
