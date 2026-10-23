import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { isFeedbackAvailable, normalizeEndpoint } from './endpoints'

/**
 * 宛先の環境変数化（src/config/endpoints.ts）のラチェット。
 * 目的: ソースを公開した時、第三者が何も設定せずにビルドしたアプリが提供者のサーバーへ通信しないこと。
 */
const ROOT = join(__dirname, '..', '..')
const SRC = join(ROOT, 'src')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** 焼く前の検査（scripts/check-release-env.mjs）が列挙する6つ。endpoints.ts・.env.example と一致することを下で見る。 */
const SCRIPT_KEYS: string[] = (() => {
  const block = read('scripts/check-release-env.mjs').match(/export const REQUIRED_KEYS = \[([\s\S]*?)\]/)
  return block ? [...block[1].matchAll(/'([A-Z0-9_]+)'/g)].map((m) => m[1]) : []
})()
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

function listSources(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...listSources(p))
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}
const sources = listSources(SRC).map((f) => ({ rel: relative(SRC, f).split(sep).join('/'), text: readFileSync(f, 'utf8') }))

describe('normalizeEndpoint', () => {
  it('未設定・空・空白だけは null、それ以外は前後の空白を落とした値', () => {
    expect(normalizeEndpoint(undefined)).toBeNull()
    expect(normalizeEndpoint(null)).toBeNull()
    expect(normalizeEndpoint('')).toBeNull()
    expect(normalizeEndpoint('  ')).toBeNull()
    expect(normalizeEndpoint(' https://a.example.com/ ')).toBe('https://a.example.com/')
  })
})

describe('isFeedbackAvailable（フィードバックの入口を出すか）', () => {
  it('送信先・連絡先メールのどちらかがあれば出す、どちらも無ければ出さない', () => {
    expect(isFeedbackAvailable('https://api.example.com/', null)).toBe(true)
    expect(isFeedbackAvailable(null, 'a@example.com')).toBe(true)
    expect(isFeedbackAvailable(null, null)).toBe(false)
  })
})

describe('何も設定しないビルド（fork の既定）', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('6つの宛先はすべて null、フィードバックの入口も出さない', async () => {
    vi.resetModules()
    for (const k of SCRIPT_KEYS) vi.stubEnv(k, '')
    const m = await import('./endpoints')
    expect([
      m.KILL_SWITCH_URL,
      m.FEEDBACK_ENDPOINT,
      m.LITUS_SITE_URL,
      m.CONTACT_EMAIL,
      m.IOS_REVIEW_URL,
      m.ANDROID_REVIEW_URL,
    ]).toEqual([null, null, null, null, null, null])
    expect(m.FEEDBACK_AVAILABLE).toBe(false)
  })

  it('設定すれば各定数に入る', async () => {
    vi.resetModules()
    for (const k of SCRIPT_KEYS) vi.stubEnv(k, `https://${k.toLowerCase()}.example.com/`)
    const m = await import('./endpoints')
    expect(m.KILL_SWITCH_URL).toBe('https://expo_public_killswitch_url.example.com/')
    expect(m.ANDROID_REVIEW_URL).toBe('https://expo_public_android_review_url.example.com/')
    expect(m.FEEDBACK_AVAILABLE).toBe(true)
  })
})

describe('配線（ソースを読む形）', () => {
  const endpoints = read('src/config/endpoints.ts')

  it('6つを process.env.EXPO_PUBLIC_* のメンバ式の直書きで読む（babel-preset-expo が定数化する唯一の形）', () => {
    expect(SCRIPT_KEYS).toHaveLength(6)
    for (const k of SCRIPT_KEYS) expect(strip(endpoints)).toContain(`process.env.${k})`)
    expect(strip(endpoints)).not.toMatch(/process\.env\s*\[/)
    expect(strip(endpoints)).not.toMatch(/\}\s*=\s*process\.env\b/)
  })

  it('6つの環境変数を読むのは endpoints.ts だけ', () => {
    const hits = sources
      .filter((f) => f.rel !== 'config/endpoints.ts')
      .filter((f) => SCRIPT_KEYS.some((k) => strip(f.text).includes(k)))
      .map((f) => f.rel)
    expect(hits).toEqual([])
  })

  it('提供者の宛先の直書きが src/ のコードに無い（コメント・規約本文は対象外）', () => {
    // 提供者のドメインは app.json のパッケージ名（逆ドメイン表記）の先頭2つから作る＝このテスト自体にも字面を残さない。
    const pkg: string = JSON.parse(read('app.json')).expo.android.package
    const domain = pkg.split('.').slice(0, 2).reverse().join('.')
    expect(domain.split('.')).toHaveLength(2)
    const esc = domain.replace(/\./g, '\\.')
    const PROVIDER = new RegExp(String.raw`https?://[^\s'"\x60]*(?:${esc}|apps\.apple\.com|play\.google\.com)|@${esc}`)
    // 計器の陽性対照: 提供者の URL・メールの形を確かに拾う
    expect(PROVIDER.test(`'https://api.${domain}/x'`)).toBe(true)
    expect(PROVIDER.test(`'contact@${domain}'`)).toBe(true)
    expect(PROVIDER.test(`'https://play.google.com/store/apps/details?id=x'`)).toBe(true)
    expect(PROVIDER.test(`'https://example.com/'`)).toBe(false)
    const hits = sources
      .filter((f) => f.rel !== 'screens/TermsConsentScreen.tsx')
      .filter((f) => PROVIDER.test(strip(f.text)))
      .map((f) => f.rel)
    expect(hits).toEqual([])
  })

  it('.env.example は6つ（＋ビルド種別）のキーを値なしで持ち、.env は git 外', () => {
    const example = read('.env.example')
    const lines = example.split('\n').filter((l) => /^[A-Z_]+=/.test(l))
    const keys = lines.map((l) => l.split('=')[0])
    for (const k of SCRIPT_KEYS) expect(keys).toContain(k)
    expect(keys).toContain('EXPO_PUBLIC_RELEASE_STAGE')
    for (const l of lines) expect(l, l).toMatch(/^[A-Z_]+=$/)
    const gi = read('.gitignore').split('\n').map((l) => l.trim())
    expect(gi).toContain('.env')
    expect(gi).toContain('!.env.example')
    expect(existsSync(join(ROOT, '.env.example'))).toBe(true)
  })

  it('キルスイッチ: 宛先が無いビルドは取得もキャッシュの読込もしない（停止画面にならない）', () => {
    const p = strip(read('src/health/KillSwitchProvider.tsx'))
    expect(p).toMatch(/if \(!KILL_SWITCH_ENABLED\) return\n/)
    expect(p).toMatch(/if \(!KILL_SWITCH_ENABLED\) \{\s*setCacheLoaded\(true\)\s*return\s*\}\s*let active = true\s*loadKillSwitchCache\(\)/)
    // 「最新情報を見る」は紹介ページがある時だけ
    expect(p).toMatch(/\{LITUS_SITE_URL \? \(\s*<Pressable[^>]*onPress=\{openLitusSite\}/)
  })

  it('お知らせ帯: 紹介ページが無いビルドでは押せない', () => {
    const b = strip(read('src/ui/NoticeBanner.tsx'))
    expect(b).toContain('onPress={hasSite ? openLitusSite : undefined}')
    expect(b).toContain('disabled={!hasSite}')
  })

  it('設定: フィードバック・友だちに教える・紹介ページ ↗ はそれぞれの宛先がある時だけ', () => {
    const s = strip(read('src/screens/SettingsScreen.tsx'))
    const gate = (flag: string, marker: string) => {
      const i = s.indexOf(marker)
      expect(i, marker).toBeGreaterThan(-1)
      const before = s.slice(Math.max(0, i - 400), i)
      expect(before, marker).toContain(`{${flag} ? (`)
    }
    gate('FEEDBACK_AVAILABLE', 'title="フィードバックを送る"')
    gate('SHARE_AVAILABLE', 'title="友だちに教える"')
    gate('LITUS_SITE_URL', '紹介ページ ↗')
    expect(s).toContain('{FEEDBACK_AVAILABLE ? <FeedbackSheet')
  })

  it('出席: 「この不具合を開発者に送る」はすべてフィードバックの宛先がある時だけ', () => {
    const a = strip(read('src/screens/AttendanceScreen.tsx'))
    const parts = a.split('この不具合を開発者に送る')
    expect(parts.length).toBe(3)
    for (const before of parts.slice(0, -1)) expect(before.slice(-400)).toContain('{FEEDBACK_AVAILABLE ? (')
    expect(a).toMatch(/\{FEEDBACK_AVAILABLE \? \(\s*<FeedbackSheet/)
  })

  it('フィードバック: 送信先が無ければ送らず、連絡先メールが無ければ「メールで送る」を出さない', () => {
    const f = strip(read('src/report/FeedbackSheet.tsx'))
    expect(f).toContain('const CAN_SUBMIT = FEEDBACK_ENDPOINT !== null')
    expect(f).toContain('const CAN_MAIL = DIAG_REPORT_TO !== null')
    expect(f).toContain('if (!envelope || !CAN_SUBMIT) return')
    expect(f).toContain('const showFallback = submitFailed || !CAN_SUBMIT')
    expect(f).toMatch(/\|\| DIAG_REPORT_TO === null\) return null/)
    // 「メールで送る」は2か所。コピーが主の側は CAN_MAIL で囲み、メールが主の側は fallbackUrl がある時（＝宛先あり）だけ
    expect(f).toMatch(/\{CAN_MAIL \? \(\s*<Pressable[\s\S]{0,300}?onPress=\{onMail\}/)
    expect(f).toContain('const copyPrimary = fallbackUrl ? mailtoMayTruncate(fallbackUrl) : true')
  })
})
