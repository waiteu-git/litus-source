import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// プラグインは CommonJS。expo/config-plugins を読まない純粋層だけを import する。
import { applyUploadSigning, STORE_FILE_PROP } from '../../plugins/releaseSigning.js'

const ROOT = join(__dirname, '..', '..')
const appJson = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'))

/**
 * Expo テンプレートの該当部分を実物どおりに写したもの（2026-07-28 の生成物から採取）。
 * 注目点: `signingConfig signingConfigs.debug` が debug と release の**2箇所**にあり、
 * release 側だけを差し替える必要がある。
 */
const TEMPLATE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
            shrinkResources enableShrinkResources.toBoolean()
            minifyEnabled enableMinifyInReleaseBuilds
            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
            def enablePngCrunchInRelease = findProperty('android.enablePngCrunchInReleaseBuilds') ?: 'true'
            crunchPngs enablePngCrunchInRelease.toBoolean()
        }
    }
}
`

describe('リリース署名の差し込み（prebuild で消える android/ を plugin で直す）', () => {
  const out: string = applyUploadSigning(TEMPLATE)

  it('signingConfigs に release を足す', () => {
    expect(out).toContain('release {')
    expect(out).toContain(`storeFile file(${STORE_FILE_PROP})`)
    expect(out).toContain('storePassword LITUS_UPLOAD_STORE_PASSWORD')
    expect(out).toContain('keyAlias LITUS_UPLOAD_KEY_ALIAS')
    expect(out).toContain('keyPassword LITUS_UPLOAD_KEY_PASSWORD')
  })

  it('release ビルドタイプだけを差し替える（debug ビルドタイプは debug 署名のまま）', () => {
    const debugBlock = out.slice(out.indexOf('buildTypes'), out.indexOf('release {', out.indexOf('buildTypes')))
    expect(debugBlock).toContain('signingConfig signingConfigs.debug')
    expect(debugBlock).not.toContain('hasProperty')
  })

  it('プロパティが無ければ debug 署名へフォールバックする（鍵の無い環境でビルドが壊れない）', () => {
    expect(out).toContain(
      `signingConfig project.hasProperty('${STORE_FILE_PROP}') ? signingConfigs.release : signingConfigs.debug`,
    )
  })

  it('秘密の値そのものを生成物へ書かない（供給は Gradle プロパティ経由）', () => {
    // 検査対象は差し込んだ release 署名ブロックのみ。テンプレートの debug 側が持つ
    // storePassword 'android'（公開されている既知のデバッグ鍵）は正当なので触れない。
    const sc = out.slice(out.indexOf('signingConfigs'), out.indexOf('buildTypes'))
    const injected = sc.slice(sc.indexOf('release {'))
    expect(injected).not.toMatch(/storePassword\s+['"]/)
    expect(injected).not.toMatch(/keyPassword\s+['"]/)
    expect(injected).not.toMatch(/storeFile file\('/) // パスもリテラルで書かない
    expect(sc.match(/storeFile file\('/g) ?? []).toHaveLength(1) // debug.keystore の1件だけ
  })

  it('生成物の桁が崩れない（差し込みは閉じ括弧の行頭へ入れる）', () => {
    expect(out).toContain('\n        release {') // signingConfigs 直下＝8桁
    expect(out).not.toContain('\n            release {') // 閉じ括弧のインデントが前に残った形
    expect(out).toContain('\n    }\n    buildTypes') // signingConfigs の閉じ括弧は4桁のまま
  })

  it('二重適用しても壊れない（冪等）', () => {
    expect(applyUploadSigning(out)).toBe(out)
  })

  it('テンプレートの形が変わったら黙って通さず落とす', () => {
    expect(() => applyUploadSigning('android {\n}\n')).toThrow(/signingConfigs/)
  })

  it('config plugin が app.json に登録されている', () => {
    const plugins: unknown[] = appJson.expo.plugins
    expect(plugins.filter((p) => typeof p === 'string')).toContain('./plugins/withReleaseSigning.js')
  })
})
