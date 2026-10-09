import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * 設定「友だちに教える」（OS の共有シート）の配線ラチェット（ソースを読む形）。
 * 設計: docs/design/2026-10-09-G-share-to-friends.md §5.1-7〜11・実装者への禁止事項
 *
 * 守っているのは: 共有シートを開く入口が1つ（openShareSheet.ts）で、設定の行を押した時だけ開くこと／
 * 戻り値（iOS の activityType＝共有先）を取らないこと／記録・送信・評価依頼・不具合報告とつながらないこと。
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

const OPEN = 'share/openShareSheet.ts'
const SETTINGS = 'screens/SettingsScreen.tsx'

/** react-native から Share を import する形（別名つきも含む）。 */
const IMPORTS_SHARE = /import\s*(?:type\s+)?\{[^}]*\bShare\b[^}]*\}\s*from\s*['"]react-native['"]/
/** Share.share( の呼び出し。 */
const CALLS_SHARE = /\bShare\s*\.\s*share\s*\(/
/** openShareSheet の読み込み（静的 import・動的 import()・require）。 */
const IMPORTS_OPEN = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"][^'"]*openShareSheet['"]/
/** 戻り値を取る形（代入・await・.then）。 */
const TAKES_RESULT = [
  /=\s*(?:await\s+)?Share\s*\.\s*share\b/,
  /\bawait\s+Share\s*\.\s*share\b/,
  /Share\s*\.\s*share\s*\((?:[^()]|\([^()]*\))*\)\s*\.then\b/,
]

const fileOf = (rel: string) => files.find((f) => f.rel === rel)

describe('共有シートの配線（ラチェット）', () => {
  it('計器の陽性対照: 実物の src/ を読めていて、share/openShareSheet.ts と設定画面が在る', () => {
    expect(files.length).toBeGreaterThan(100)
    expect(fileOf(OPEN)).toBeDefined()
    expect(fileOf(SETTINGS)).toBeDefined()
  })

  it('react-native から Share を import するのは openShareSheet.ts だけ', () => {
    const hits = files.filter((f) => IMPORTS_SHARE.test(strip(f.text))).map((f) => f.rel)
    expect(hits).toEqual([OPEN])
  })

  it('Share.share( を呼ぶのは openShareSheet.ts だけ', () => {
    const hits = files.filter((f) => CALLS_SHARE.test(strip(f.text))).map((f) => f.rel)
    expect(hits).toEqual([OPEN])
  })

  it('openShareSheet を読み込むのは設定画面だけ', () => {
    const hits = files
      .filter((f) => f.rel !== OPEN)
      .filter((f) => IMPORTS_OPEN.test(strip(f.text)))
      .map((f) => f.rel)
    expect(hits).toEqual([SETTINGS])
  })

  it('設定画面での出現は onPress={openShareSheet} の形だけ（直接呼ばない＝useEffect 等から開かない）', () => {
    const t = strip(fileOf(SETTINGS)!.text)
    const body = t.replace(/^import[^\n]*openShareSheet[^\n]*$/gm, '')
    const all = (body.match(/\bopenShareSheet\b/g) ?? []).length
    const asHandler = (body.match(/onPress=\{openShareSheet\}/g) ?? []).length
    expect(asHandler).toBe(1)
    expect(all).toBe(asHandler)
    expect(body).not.toMatch(/\bopenShareSheet\s*\(/)
  })

  it('openShareSheet.ts は Share.share の戻り値を取らない（代入・await・.then が無い）', () => {
    const t = strip(fileOf(OPEN)!.text)
    for (const re of TAKES_RESULT) expect(t, String(re)).not.toMatch(re)
    expect(t).toMatch(CALLS_SHARE)
    expect(t).toMatch(/\.catch\s*\(/)
  })

  it('src/share/ に activityType の語が無い', () => {
    const hits = files.filter((f) => f.rel.startsWith('share/')).filter((f) => /activityType/.test(f.text))
    expect(hits.map((f) => f.rel)).toEqual([])
  })

  it('src/share/ は保存・送信・評価依頼・不具合報告とつながらない', () => {
    const banned = [
      /storage/i,
      /AsyncStorage/,
      /\bsetItem\b/,
      /\buseSync\b/,
      /\bfetch\s*\(/,
      /expo-sharing/,
      /requestStoreReview/,
      /expo-store-review/,
      /\brequestReview\b/,
      /['"][^'"]*\/report\//,
    ]
    const share = files.filter((f) => f.rel.startsWith('share/'))
    expect(share.length).toBeGreaterThanOrEqual(3)
    for (const f of share) {
      const t = strip(f.text)
      for (const re of banned) expect(t, `${f.rel} ${re}`).not.toMatch(re)
    }
  })

  it('逆向き: src/report/ は share を import しない', () => {
    const hits = files
      .filter((f) => f.rel.startsWith('report/'))
      .filter((f) => /['"][^'"]*\/share\//.test(strip(f.text)))
      .map((f) => f.rel)
    expect(hits).toEqual([])
  })

  it('設定画面に LP の URL の直書きが無い（LITUS_SITE_URL に一本化）', () => {
    expect(strip(fileOf(SETTINGS)!.text)).not.toContain('https://litus.waiteu.dev')
  })

  it('設定画面: 行「友だちに教える」は「フィードバックを送る」と「アプリ情報」の間', () => {
    const t = strip(fileOf(SETTINGS)!.text)
    const fb = t.indexOf('title="フィードバックを送る"')
    const share = t.indexOf('title="友だちに教える"')
    const info = t.indexOf('title="アプリ情報"')
    expect(fb).toBeGreaterThan(-1)
    expect(share).toBeGreaterThan(fb)
    expect(info).toBeGreaterThan(share)
    expect(t).toContain('sub="紹介ページのURLを送る"')
    expect(t.slice(share, info)).toContain('onPress={openShareSheet}')
  })

  it('設定画面: 「事前登録・お知らせ」を「紹介ページ ↗」に直し、openLitusSite で開く', () => {
    const t = strip(fileOf(SETTINGS)!.text)
    expect(t).not.toContain('事前登録・お知らせ')
    expect(t).toContain('紹介ページ ↗')
    expect(t).toMatch(/onPress=\{openLitusSite\}/)
  })
})

describe('検出器の対照（実物にまだ無い違反の形を、確かに拾える）', () => {
  it.each([
    "import { Share } from 'react-native'",
    'import { Platform, Share, View } from "react-native"',
    "import { Share as S } from 'react-native'",
    "import {\n  Alert,\n  Share,\n} from 'react-native'",
  ])('Share import 陽性: %s', (src) => {
    expect(IMPORTS_SHARE.test(strip(src))).toBe(true)
  })

  it.each([
    "import { ShareIcon } from './x'",
    "// import { Share } from 'react-native'",
    "/* import { Share } from 'react-native' */",
    "import * as Sharing from 'expo-sharing'",
    "import { Shared } from 'react-native'",
  ])('Share import 陰性: %s', (src) => {
    expect(IMPORTS_SHARE.test(strip(src))).toBe(false)
  })

  it.each([
    "import { openShareSheet } from '../share/openShareSheet'",
    "const m = await import('../share/openShareSheet')",
    "const m = require('../share/openShareSheet')",
  ])('openShareSheet import 陽性: %s', (src) => {
    expect(IMPORTS_OPEN.test(strip(src))).toBe(true)
  })

  it.each([
    "// import { openShareSheet } from '../share/openShareSheet'",
    "import { buildShareContent } from '../share/shareMessage'",
  ])('openShareSheet import 陰性: %s', (src) => {
    expect(IMPORTS_OPEN.test(strip(src))).toBe(false)
  })

  it.each([
    'const r = Share.share(buildShareContent())',
    'const r = await Share.share(buildShareContent())',
    'await Share.share({ message })',
    'Share.share(buildShareContent()).then((r) => log(r))',
    'Share.share({ message: m }).then(() => undefined)',
  ])('戻り値を取る形 陽性: %s', (src) => {
    expect(TAKES_RESULT.some((re) => re.test(strip(src)))).toBe(true)
  })

  it.each([
    'Share.share(buildShareContent()).catch(() => undefined)',
    'void Share.share({ message })',
  ])('戻り値を取る形 陰性: %s', (src) => {
    expect(TAKES_RESULT.some((re) => re.test(strip(src)))).toBe(false)
  })
})
