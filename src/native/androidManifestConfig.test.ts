import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..')
const appJson = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'))

describe('Androidのマージ後manifestに残さない権限・属性', () => {
  it('SYSTEM_ALERT_WINDOW をブロックする', () => {
    // Expoテンプレート由来で用途ゼロ（canDrawOverlays/TYPE_APPLICATION_OVERLAY の使用は0件）なのに
    // リリースのマージ後manifestに残り、Playの権限一覧に「他のアプリの上に重ねて表示」が出ていた。
    // android/ は gitignore で prebuild 再生成されるため、生成物ではなく app.json で落とす。
    expect(appJson.expo.android.blockedPermissions).toContain('android.permission.SYSTEM_ALERT_WINDOW')
  })

  it('READ/WRITE_EXTERNAL_STORAGE はブロックしない（expo-file-system が自前で宣言している）', () => {
    const blocked: string[] = appJson.expo.android.blockedPermissions ?? []
    expect(blocked).not.toContain('android.permission.READ_EXTERNAL_STORAGE')
    expect(blocked).not.toContain('android.permission.WRITE_EXTERNAL_STORAGE')
  })

  it('supportsRtl を落とす config plugin が登録されている', () => {
    // supportsRtl は app.json / expo-build-properties のどちらにも設定キーが無く、plugin でしか落とせない。
    const plugins: unknown[] = appJson.expo.plugins
    expect(plugins.filter((p) => typeof p === 'string')).toContain('./plugins/withNoSupportsRtl.js')
  })

  it('自動バックアップを無効にする（AsyncStorage 全体が Google Drive へ出るのを止める）', () => {
    // Expo 既定は allowBackup=true で、時間割・課題・掲示本文・出席済み記録（認証コードを含む）が
    // 端末外（Googleアカウントのバックアップ）へ出る。これは掲載申告の「端末外へ出る3経路」にも
    // 同意画面の文言にも無い第4の経路だった（2026-07-28 セキュリティ監査 M-2）。
    // アカウント機能が無く、再ログイン＋同期でほぼ復元できるため、申告と実装を一致させる方を採る。
    expect(appJson.expo.android.allowBackup).toBe(false)
  })
})

describe('withNoSupportsRtl', () => {
  it('<application> の supportsRtl を false にする', async () => {
    const { setSupportsRtlFalse } = await import('../../plugins/supportsRtl.js')
    const manifest = { manifest: { application: [{ $: { 'android:supportsRtl': 'true' } }] } }
    expect(setSupportsRtlFalse(manifest).manifest.application[0].$['android:supportsRtl']).toBe('false')
  })

  it('application が無い manifest でも例外を投げない', async () => {
    const { setSupportsRtlFalse } = await import('../../plugins/supportsRtl.js')
    expect(() => setSupportsRtlFalse({ manifest: {} })).not.toThrow()
    expect(() => setSupportsRtlFalse({})).not.toThrow()
  })
})
