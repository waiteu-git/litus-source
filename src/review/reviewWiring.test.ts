import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * 評価依頼（F）の配線ラチェット（ソースを読む形）。vitest は純粋層しか実行できないので、
 * 「呼んでよい場所」を文字列で固定する。設計: docs/design/2026-09-24-F-store-review-prompt.md §4.8・実装者への禁止事項
 *
 * 守っているのは、Apple・Google が明記している禁止（ボタン等の操作から依頼 API を呼ばない／依頼の前後に
 * 質問や独自ダイアログを出さない／報酬・特典を示さない）と、依頼の入口が1つであること。
 */
const SRC = join(__dirname, '..')

function listSources(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...listSources(p))
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

const files = listSources(SRC).map((f) => ({
  rel: relative(SRC, f).split(sep).join('/'),
  text: readFileSync(f, 'utf8'),
}))

const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const REQUEST = 'review/requestStoreReview.ts'
const HOOK = 'review/useStoreReviewPrompt.ts'

describe('評価依頼の配線（ラチェット）', () => {
  it('計器の陽性対照: 実物の src/ を読めていて、依頼のラッパーと入口の hook が在る', () => {
    expect(files.length).toBeGreaterThan(100)
    expect(files.find((f) => f.rel === REQUEST)).toBeDefined()
    expect(files.find((f) => f.rel === HOOK)).toBeDefined()
  })

  it('OS の依頼 API（requestReview）を呼ぶのは requestStoreReview.ts だけ', () => {
    const hits = files.filter((f) => /\brequestReview\s*\(/.test(strip(f.text))).map((f) => f.rel)
    expect(hits).toEqual([REQUEST])
  })

  it('requestStoreReview を読み込むのは useStoreReviewPrompt.ts だけ（画面・ボタンから依頼に届かない）', () => {
    const hits = files
      .filter((f) => f.rel !== REQUEST)
      .filter((f) => /from\s+['"][^'"]*requestStoreReview['"]/.test(strip(f.text)))
      .map((f) => f.rel)
    expect(hits).toEqual([HOOK])
  })

  it('useStoreReviewPrompt を呼ぶのは HomeScreen の1か所だけ', () => {
    const calls = files
      .filter((f) => f.rel !== HOOK)
      .map((f) => ({ rel: f.rel, n: (strip(f.text).match(/\buseStoreReviewPrompt\s*\(/g) ?? []).length }))
      .filter((c) => c.n > 0)
    expect(calls).toEqual([{ rel: 'screens/HomeScreen.tsx', n: 1 }])
  })

  it('依頼の入口（hook・ラッパー）は、質問や独自ダイアログを出さない（Alert・Modal を使わない）', () => {
    for (const rel of [HOOK, REQUEST]) {
      const t = strip(files.find((f) => f.rel === rel)!.text)
      expect(t, rel).not.toMatch(/\bAlert\b/)
      expect(t, rel).not.toMatch(/\bModal\b/)
      expect(t, rel).not.toMatch(/\bonPress\b/)
    }
  })

  it('src/review/ に、報酬・特典・「星5」を示す文言が無い（Google Play のポリシー）', () => {
    const offenders = files
      .filter((f) => f.rel.startsWith('review/'))
      .filter((f) => /[★☆]|星\s*[5５五]|特典|報酬|プレゼント|キャンペーン|クーポン/.test(strip(f.text)))
      .map((f) => f.rel)
    expect(offenders).toEqual([])
  })

  it('依頼の入口は foregroundPulse の時機の表を使わない（初回起動で発火せず、同期の段階発火の表を共有するため）', () => {
    const t = strip(files.find((f) => f.rel === HOOK)!.text)
    expect(t).not.toMatch(/foregroundOrchestrator|foregroundPulse|subscribeForeground/)
    const pulse = files.find((f) => f.rel === 'app/foregroundPulse.ts')!.text
    expect(pulse).not.toMatch(/review/i)
  })

  it('設定の常設リンクは通常の URL（action=write-review・https）で、依頼 API に届かない', () => {
    const link = files.find((f) => f.rel === 'review/storeReviewLink.ts')!.text
    expect(link).toContain('action=write-review')
    expect(link).not.toContain('market://')
    const settings = strip(files.find((f) => f.rel === 'screens/SettingsScreen.tsx')!.text)
    expect(settings).toContain('storeReviewUrl(')
    expect(settings).not.toMatch(/requestStoreReview|expo-store-review|requestReview/)
  })
})
