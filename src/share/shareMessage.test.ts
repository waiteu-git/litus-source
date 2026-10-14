import { afterAll, afterEach, describe, it, expect, vi } from 'vitest'

// 紹介ページはビルド時の環境変数（src/config/endpoints.ts）。「設定あり」の値を import より先に入れる。
vi.hoisted(() => {
  process.env.EXPO_PUBLIC_SITE_URL = 'https://site.example.com/'
})
afterAll(() => {
  delete process.env.EXPO_PUBLIC_SITE_URL
})

import { buildShareContent, SHARE_AVAILABLE, SHARE_LINE } from './shareMessage'
import { LITUS_SITE_URL } from '../health/notice'

/** 設定ありのビルドでの共有の中身（null なら検査の前提が崩れている）。 */
const content = (): { message: string } => {
  const c = buildShareContent()
  if (c === null) throw new Error('EXPO_PUBLIC_SITE_URL が入っていない')
  return c
}

/**
 * 設定「友だちに教える」で OS の共有シートに渡す中身のラチェット。
 * 設計: docs/design/2026-10-09-G-share-to-friends.md §4・§5.1・実装者への禁止事項 2・3・7
 *
 * 検査対象は OS に渡す**全文字列**。options（件名・見出し）は渡さない裁定（2026-10-09 本人）なので、
 * 現状は content の値だけ。options を渡すと決めたら、その値もここへ足す。
 */
const allStrings = (): string[] => Object.values(content()).filter((v): v is string => typeof v === 'string')

const URL_RE = /https?:\/\/[^\s]+/g

/** 共有文に書かない語（§禁止7・§5.1-3）。名前→検出器。 */
const FORBIDDEN: Array<[string, RegExp]> = [
  ['出席', /出席/],
  ['自動', /自動/],
  ['無料', /無料/],
  ['永久', /永久/],
  ['★☆', /[★☆]/],
  ['星5', /星\s*[5５五]/],
  ['特典', /特典/],
  ['報酬', /報酬/],
  ['プレゼント', /プレゼント/],
  ['キャンペーン', /キャンペーン/],
  ['クーポン', /クーポン/],
  ['公式（非公式は許す）', /(?<!非)公式/],
  ['版数 v1', /\bv\d/i],
  ['版数 1.2', /\d+\.\d+/],
  ['数字（出典の無い数値）', /[0-9０-９]/],
]

/** URL を除いた部分に禁止語があれば、その名前を返す。 */
function findForbidden(s: string): string[] {
  const body = s.replace(URL_RE, '')
  return FORBIDDEN.filter(([, re]) => re.test(body)).map(([name]) => name)
}

describe('共有の中身（buildShareContent）', () => {
  it('content は message だけ（title・url のキーを持たない）', () => {
    const c = content()
    expect(Object.keys(c)).toEqual(['message'])
    expect(c).not.toHaveProperty('title')
    expect(c).not.toHaveProperty('url')
  })

  it('本人の確定文言そのまま（一文＋改行＋LP の URL）', () => {
    expect(SHARE_LINE).toBe('LETUSの課題もCLASSの時間割も、まとめて見られる非公式アプリ、リタス')
    expect(content().message).toBe(`${SHARE_LINE}\n${LITUS_SITE_URL}`)
  })

  it('全文字列を通じて URL は LITUS_SITE_URL ただ1つ', () => {
    const urls = allStrings().flatMap((s) => s.match(URL_RE) ?? [])
    expect(urls).toEqual([LITUS_SITE_URL])
  })

  it('URL に計測の印（? # utm_）が無い', () => {
    for (const s of allStrings()) {
      for (const u of s.match(URL_RE) ?? []) {
        expect(u).not.toMatch(/[?#]|utm_/i)
      }
    }
  })

  it('禁止語が無い（出席・自動・無料・公式・版数・数字 など）', () => {
    for (const s of allStrings()) expect(findForbidden(s), s).toEqual([])
  })

  it('message に「非公式」を含む（必須の裁定）', () => {
    expect(content().message).toContain('非公式')
  })

  it('呼ぶたびに同じ値（ユーザーのデータや時刻を差し込まない）', () => {
    expect(content()).toEqual(content())
  })
})

describe('禁止語の検出器の対照', () => {
  it.each([
    ['出席も自動で', ['出席', '自動']],
    ['ずっと無料', ['無料']],
    ['永久に使える', ['永久']],
    ['★5つで', ['★☆', '数字（出典の無い数値）']],
    ['星５をお願い', ['星5', '数字（出典の無い数値）']],
    ['特典つき', ['特典']],
    ['報酬あり', ['報酬']],
    ['プレゼント中', ['プレゼント']],
    ['キャンペーン実施', ['キャンペーン']],
    ['クーポン配布', ['クーポン']],
    ['大学公式アプリ', ['公式（非公式は許す）']],
    ['リタス v1 公開', ['版数 v1', '数字（出典の無い数値）']],
    ['最新版 1.1.1', ['版数 1.2', '数字（出典の無い数値）']],
    ['利用者3000人', ['数字（出典の無い数値）']],
  ])('陽性/対照: %s', (s, expected) => {
    expect(findForbidden(s)).toEqual(expected)
  })

  it.each([
    '非公式アプリ',
    'LETUSの課題もCLASSの時間割も',
    'https://example.com/v1/2.0?x=1',
  ])('陰性: %s', (s) => {
    expect(findForbidden(s)).toEqual([])
  })

  it('URL 検出器は計測の印つき URL を拾う（陽性）', () => {
    const u = 'https://example.com/?utm_source=app'.match(URL_RE) ?? []
    expect(u).toHaveLength(1)
    expect(u[0]).toMatch(/[?#]|utm_/i)
  })
})

describe('紹介ページが未設定のビルド', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('設定ありでは共有の入口を出す', () => {
    expect(SHARE_AVAILABLE).toBe(true)
  })

  it('引数で null を渡すと null（共有しない）', () => {
    expect(buildShareContent(null)).toBeNull()
  })

  it('EXPO_PUBLIC_SITE_URL が空なら、入口を出さず（SHARE_AVAILABLE false）中身も null', async () => {
    vi.resetModules()
    vi.stubEnv('EXPO_PUBLIC_SITE_URL', '')
    const mod = await import('./shareMessage')
    expect(mod.SHARE_AVAILABLE).toBe(false)
    expect(mod.buildShareContent()).toBeNull()
  })
})
