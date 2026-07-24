/**
 * 受動版フィンガープリント（spec§9・T8）のテスト。
 *
 * 2層で固定する:
 * 1. 版セグメント → 版番号の変換規則（合成 HTML・LTW `moodleFingerprint.test.ts` と同型）。
 * 2. **実 DOM fixture に対する実測挙動**（4.5.8 実機／5.2 実採取の両世代）。
 *
 * ⚠実測で判明した重要事実: 本リポの実 DOM fixture には `docs.moodle.org/<NNN>/` リンクが
 * **1本も含まれていない**。ヘルプリンクは Moodle のフッタ／ヘルプポップオーバーにあり、
 * fixture 採取時のトリム（`__fixtures__/moodle52/README.md` の「head・ナビ・フッタ・スクリプト塊を削除」）
 * で落ちているため。よって実 fixture が固定できるのは「版が読めない → null → bs5=false →
 * BS5ノートを出さない」という**安全側の既定**であり、両世代の版推定そのものは
 * 「実 fixture ＋ トリムで落ちたフッタの docs リンクを復元した合成」で固定する。
 * これは実運用の期待とも整合する: LETUS が `$CFG->docroot` を空にしていれば版は永久に読めず、
 * その場合 T8 は静かに何もしない（誤った版主張をしない）ことが正しい。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  extractBodyClasses,
  extractDocsVersionSegment,
  fingerprintPage,
  isBs5Generation,
  type MoodleVersion,
} from './moodleFingerprint'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8')

const FIXTURES = '../parsers/__fixtures__/'
// 5.2（BS5世代・school.moodledemo.net 実採取）
const course52 = read(`${FIXTURES}moodle52/course52_raw.html`)
const my52Raw = read(`${FIXTURES}moodle52/my52_raw.html`)
const my52Hydrated = read(`${FIXTURES}moodle52/my52_hydrated.html`)
const assign52Ja = read(`${FIXTURES}moodle52/assign52_ja.html`)
// 4.5.8（現行 LETUS・TUS 実機由来。body 開始タグを含まない innerHTML 断片）
const assignSubmitted = read(`${FIXTURES}assign-submitted-real.html`)
const assignBody458 = read(`${FIXTURES}letus-assign-body-real.html`)

/** Moodle 標準フッタの「このページのヘルプ」リンク（トリムで落ちた部分の復元）。 */
const docsFooter = (segment: string, lang: string, path: string) =>
  `<footer><a href="https://docs.moodle.org/${segment}/${lang}/${path}" target="_blank">このページのヘルプ</a></footer>`

describe('extractDocsVersionSegment（版セグメント→版番号）', () => {
  const cases: Array<{ name: string; html: string; expected: MoodleVersion | null }> = [
    { name: '405 → 4.5（現行 LETUS 世代）', html: '<a href="https://docs.moodle.org/405/ja/x">h</a>', expected: { major: 4, minor: 5 } },
    { name: '500 → 5.0', html: '<a href="https://docs.moodle.org/500/ja/x">h</a>', expected: { major: 5, minor: 0 } },
    { name: '502 → 5.2（fixture 採取元の世代）', html: '<a href="https://docs.moodle.org/502/en/x">h</a>', expected: { major: 5, minor: 2 } },
    { name: '311 → 3.11（minor が2桁）', html: '<a href="https://docs.moodle.org/311/ja/x">h</a>', expected: { major: 3, minor: 11 } },
    { name: '1001 → 10.1（major が2桁・4桁セグメント）', html: '<a href="https://docs.moodle.org/1001/en/x">h</a>', expected: { major: 10, minor: 1 } },
    { name: 'プロトコル相対リンクも拾う', html: '<a href="//docs.moodle.org/405/ja/x">h</a>', expected: { major: 4, minor: 5 } },
    { name: 'リンク皆無なら null', html: '<html><body>no help link</body></html>', expected: null },
    { name: '2桁セグメント（/39/ 旧形式）は対象外＝null', html: '<a href="https://docs.moodle.org/39/ja/x">h</a>', expected: null },
    {
      name: 'サブドメイン風の別ホストは拾わない（mydocs.moodle.org）',
      html: '<a href="https://mydocs.moodle.org/405/ja/x">h</a>',
      expected: null,
    },
  ]
  for (const c of cases) {
    it(c.name, () => {
      expect(extractDocsVersionSegment(c.html)).toEqual(c.expected)
    })
  }

  it('複数版が混在したら最頻値を採る（教員が本文に貼った旧版リンクに引きずられない）', () => {
    const html = [
      '<a href="https://docs.moodle.org/405/ja/old">教員が本文に貼った旧版</a>',
      docsFooter('502', 'ja', 'a'),
      docsFooter('502', 'ja', 'b'),
    ].join('')
    expect(extractDocsVersionSegment(html)).toEqual({ major: 5, minor: 2 })
  })

  it('同数なら先頭出現を優先する（決定的）', () => {
    const html = '<a href="//docs.moodle.org/405/ja/a">1</a><a href="//docs.moodle.org/502/ja/b">2</a>'
    expect(extractDocsVersionSegment(html)).toEqual({ major: 4, minor: 5 })
  })
})

describe('isBs5Generation', () => {
  it('版不明（null）は false＝現行 4.x 想定のまま扱う', () => {
    expect(isBs5Generation(null)).toBe(false)
  })
  it('4.5 は false・5.0/5.2/10.1 は true', () => {
    expect(isBs5Generation({ major: 4, minor: 5 })).toBe(false)
    expect(isBs5Generation({ major: 5, minor: 0 })).toBe(true)
    expect(isBs5Generation({ major: 5, minor: 2 })).toBe(true)
    expect(isBs5Generation({ major: 10, minor: 1 })).toBe(true)
  })
})

describe('extractBodyClasses（実 DOM）', () => {
  it('5.2 コースページ: 実 body クラスを読む（format-* は版跨ぎ安定クラス）', () => {
    const classes = extractBodyClasses(course52)
    expect(classes).toContain('format-topics')
    expect(classes).toContain('path-course')
    // BS5世代で入った幅制御クラス。空文字は混ざらない（連続スペースの分割）。
    expect(classes).toContain('limitedwidth')
    expect(classes.every((c) => c.length > 0)).toBe(true)
  })

  it('5.2 Dashboard: RAW と hydrated で body クラスが変わる（描画完了で page-mycourses が付く）', () => {
    expect(extractBodyClasses(my52Raw)).toContain('pagelayout-mydashboard')
    expect(extractBodyClasses(my52Raw)).not.toContain('page-mycourses')
    expect(extractBodyClasses(my52Hydrated)).toContain('page-mycourses')
  })

  it('4.5.8 実機 fixture は innerHTML 断片＝body 開始タグが無いので []（誤った観測を作らない）', () => {
    expect(extractBodyClasses(assignSubmitted)).toEqual([])
    expect(extractBodyClasses(assignBody458)).toEqual([])
  })

  it('class 属性が無い body・data-class の誤認をしない', () => {
    expect(extractBodyClasses('<body id="x">y</body>')).toEqual([])
    expect(extractBodyClasses('<body data-class="fake">y</body>')).toEqual([])
  })
})

describe('fingerprintPage（実 DOM の実測挙動）', () => {
  const realFixtures: Array<[string, string]> = [
    ['5.2 コースページ', course52],
    ['5.2 Dashboard(RAW)', my52Raw],
    ['5.2 Dashboard(hydrated)', my52Hydrated],
    ['5.2 課題ページ(JA)', assign52Ja],
    ['4.5.8 課題ページ(提出済)', assignSubmitted],
    ['4.5.8 課題本文', assignBody458],
  ]

  it.each(realFixtures)(
    '%s: docs リンクがトリムで落ちているため版は null＝BS5 を誤主張しない',
    (_name, html) => {
      const fp = fingerprintPage(html)
      expect(fp.version).toBeNull()
      expect(fp.bs5).toBe(false)
    },
  )

  it('実 5.2 DOM ＋ 復元したフッタ docs リンク → 5.2 を推定し bs5=true', () => {
    const fp = fingerprintPage(course52 + docsFooter('502', 'en', 'course/view/topics'))
    expect(fp.version).toEqual({ major: 5, minor: 2 })
    expect(fp.bs5).toBe(true)
    expect(fp.bodyClasses).toContain('format-topics')
  })

  it('実 4.5.8 DOM ＋ 復元したフッタ docs リンク → 4.5 を推定し bs5=false（現行世代では鳴らない）', () => {
    const fp = fingerprintPage(assignSubmitted + docsFooter('405', 'ja', 'mod/assign/view'))
    expect(fp.version).toEqual({ major: 4, minor: 5 })
    expect(fp.bs5).toBe(false)
  })

  it('版と bodyClasses は独立に返る（片方が読めなくても他方は返る）', () => {
    const noBody = fingerprintPage(docsFooter('502', 'ja', 'x'))
    expect(noBody.version).toEqual({ major: 5, minor: 2 })
    expect(noBody.bodyClasses).toEqual([])
  })
})

describe('禁則（spec§2）: M.cfg / asset-rev を版の情報源にしない', () => {
  it('M.cfg の中に版らしき数値があっても版として読まない', () => {
    const html = '<script>M.cfg = {"wwwroot":"https://letus.ed.tus.ac.jp","release":"5.2+","theme":"boost"};</script>'
    expect(fingerprintPage(html).version).toBeNull()
  })

  it('テーマ/JS の asset-rev（キャッシュ purge 時刻）を版として読まない', () => {
    const html = '<link href="https://letus.ed.tus.ac.jp/theme/styles.php/boost/1751234567_1/all">'
    expect(fingerprintPage(html).version).toBeNull()
  })
})
