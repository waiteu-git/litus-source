import { describe, expect, it } from 'vitest'
import { BOOT_LOGO_GREEN, BOOT_LOGO_WHITE } from './bootLogoHtml'
import { BOOT_LOGO_DARK } from './bootLogoDark'
import { WARM_BOOT_LOGO_DARK, WARM_BOOT_LOGO_GREEN, WARM_BOOT_LOGO_WHITE } from './bootLogoWarm'
import {
  LOGO_COLUMN_HEIGHT,
  SIZE_TIERS,
  STATUS_BAR_DP,
  celebrateBlockHeight,
  celebrateBlockTop,
  sizeTierForHeight,
  toCelebrateBootHtml,
  type CelebrateVariant,
} from './bootLogoCelebrate'
import { CELEBRATION_COPY } from '../celebration/celebration'
import { celebrationColors } from '../theme.celebration'

/**
 * 起動画面の「お祝いの飾り」（お祝いの2行と葉の弧）は、**原本・ダーク・warm の各 HTML を文字列変換で派生**して足す
 * （bootLogoDark / bootLogoWarm と同じ作法。原本の bootLogoHtml.ts は生成物なので手編集しない）。
 * 飾りはロゴの入れ物（144x144）の子で、入れ物の**真上**に置く＝ロゴと一緒に動く（位置がずれない）・ロゴを囲まない・
 * ロゴ列の流れを変えない（boltRise の 121.2px は列の高さの実測値。流れの中に要素を足すとスプラッシュとの継ぎ目が崩れる）。
 * 本人の指示（2026-10-08）: 「飾りはアイコンの上。ロゴと被せたくない」。
 * 設計: docs/design/2026-10-08-celebration-mode.md
 */

const BASES: Array<[string, CelebrateVariant, string]> = [
  ['white/full', 'white', BOOT_LOGO_WHITE],
  ['green/full', 'green', BOOT_LOGO_GREEN],
  ['dark/full', 'dark', BOOT_LOGO_DARK],
  ['white/warm', 'white', WARM_BOOT_LOGO_WHITE],
  ['green/warm', 'green', WARM_BOOT_LOGO_GREEN],
  ['dark/warm', 'dark', WARM_BOOT_LOGO_DARK],
]

function count(s: string, needle: string): number {
  return s.split(needle).length - 1
}

const BLOCK = /<div class="celeb"[\s\S]*?<\/svg><\/div>/

describe('toCelebrateBootHtml: 6通り（3テーマ×full/warm）すべてに、飾りを1つだけ足す', () => {
  it.each(BASES)('%s: 元と違い、飾りのブロックがちょうど1つ', (_n, variant, base) => {
    const out = toCelebrateBootHtml(base, variant)
    expect(out).not.toBe(base)
    expect(count(out, '<div class="celeb"')).toBe(1)
    expect(count(base, '<div class="celeb"')).toBe(0)
  })

  it.each(BASES)('%s: 足したものを取り除くと、元と1文字も違わない（足すだけ・既存を壊さない）', (_n, variant, base) => {
    const out = toCelebrateBootHtml(base, variant)
    const restored = out
      .replace(BLOCK, '')
      .replace(/\/\*celeb-start\*\/[\s\S]*?\/\*celeb-end\*\//, '')
      .replace('position:relative;width:144px;height:144px;animation:boltRise', 'width:144px;height:144px;animation:boltRise')
    expect(restored).toBe(base)
  })

  it.each(BASES)('%s: 画像・外部URL・data: を足さない（自前の図形と文字だけ＝出所を数値で説明できる）', (_n, variant, base) => {
    const out = toCelebrateBootHtml(base, variant)
    expect(count(out, '<img')).toBe(count(base, '<img'))
    expect(count(out, 'http')).toBe(count(base, 'http'))
    expect(count(out, 'data:')).toBe(count(base, 'data:'))
    expect(count(out, 'url(')).toBe(count(base, 'url('))
  })

  it.each(BASES)('%s: 飾りはロゴの入れ物の中で、入れ物の真上（bottom:100%）。ロゴを囲まず、ロゴ列の流れを変えない', (_n, variant, base) => {
    const out = toCelebrateBootHtml(base, variant)
    const block = out.match(BLOCK)![0]
    expect(block).toContain('position:absolute')
    expect(block).toContain('pointer-events:none')
    // ロゴの真上＝入れ物の上端（bottom:100%）に下端をつけ、余白（margin-bottom）は CSS の段階が持つ。ロゴの中心基準（top:50%）で置かない＝ロゴに重ならない。
    expect(block).toContain('bottom:100%;')
    expect(toCelebrateBootHtml(base, variant)).toMatch(/\.celeb\{margin-bottom:14px\}/)
    const outer = block.slice(0, block.indexOf('>') + 1)
    expect(outer).not.toMatch(/(^|[^-])top:|margin-top/)
    // 入れ物（相対配置）の直後・ロゴ画像の前に入る＝ロゴと一緒に動く。
    expect(out).toMatch(/position:relative;width:144px;height:144px;animation:boltRise[^"]*"><div class="celeb"[\s\S]*?<\/svg><\/div><img src="data:image\/png/)
  })

  it.each(BASES)('%s: ロゴの上昇（boltRise）が落ち着く頃に、そっと現れる／視覚効果を減らす設定では動かさない', (_n, variant, base) => {
    const block = toCelebrateBootHtml(base, variant).match(BLOCK)![0]
    // 0.36s＝規約の祝福の上限（360ms）。
    expect(block).toMatch(/animation:celebIn 0\.36s cubic-bezier\(0\.16,1,0\.3,1\) 0\.75s both/)
    expect(toCelebrateBootHtml(base, variant)).toContain('@keyframes celebIn')
  })

  it.each(BASES)('%s: 視覚効果を減らす設定では、動き（移動）を外して透明度だけのフェード（最初から不透明にしない）', (_n, variant, base) => {
    const out = toCelebrateBootHtml(base, variant)
    const m = out.match(/@media \(prefers-reduced-motion: ?reduce\)\{\.celeb\{animation:([^}]*)\}\}/)
    expect(m).not.toBeNull()
    // none ではなく、遅延つきのフェード
    expect(m![1]).toMatch(/^celebFade 0\.36s cubic-bezier\(0\.16,1,0\.3,1\) 0\.75s both!important$/)
    const fade = out.match(/@keyframes celebFade\{([^}]*\}[^}]*)\}/)
    expect(fade).not.toBeNull()
    expect(fade![1]).not.toContain('transform')
  })

  it.each(BASES)('%s: 文言は台帳（CELEBRATION_COPY）のとおり・日本語として描く（lang="ja"）・折り返さない', (_n, variant, base) => {
    const block = toCelebrateBootHtml(base, variant).match(BLOCK)![0]
    expect(block).toContain('lang="ja"')
    expect(block).toContain('white-space:nowrap')
    expect(block).toContain(`>${CELEBRATION_COPY.bootTitle}</span>`)
    expect(block).toContain(`>${CELEBRATION_COPY.bootName}</span>`)
    const c = celebrationColors(variant)
    expect(block).toContain(`color:${c.bootTitle};`)
    expect(block).toContain(`color:${c.bootName};`)
  })

  it('warm でも飾りの動きは「最終状態へ畳まれない」＝warm 変換は先に済んでいて、飾りのアニメを触らない', () => {
    const out = toCelebrateBootHtml(WARM_BOOT_LOGO_WHITE, 'white')
    expect(out).toContain('celebIn 0.36s')
    expect(out).not.toMatch(/celebIn 0s/)
  })

  it('バリアントごとに色が違う（白地で象牙は消える・翠地で翠は消える）', () => {
    const fills = (h: string) => new Set(h.match(BLOCK)![0].match(/fill="#[0-9a-f]{6}"/gi))
    const w = fills(toCelebrateBootHtml(BOOT_LOGO_WHITE, 'white'))
    const g = fills(toCelebrateBootHtml(BOOT_LOGO_GREEN, 'green'))
    const d = fills(toCelebrateBootHtml(BOOT_LOGO_DARK, 'dark'))
    expect([...w].join()).not.toBe([...g].join())
    expect([...w].join()).not.toBe([...d].join())
    expect([...g].join()).not.toBe([...d].join())
  })

  it('二重に足さない（すでに飾りがある HTML はそのまま返す）', () => {
    const once = toCelebrateBootHtml(BOOT_LOGO_WHITE, 'white')
    expect(toCelebrateBootHtml(once, 'white')).toBe(once)
  })

  it('足す場所（ロゴの入れ物）が見つからない HTML は、何もせず元のまま返す（生成物が将来変わっても起動を壊さない）', () => {
    const odd = '<html><body><div>no logo here</div></body></html>'
    expect(toCelebrateBootHtml(odd, 'white')).toBe(odd)
  })

  it('葉の飾りは規約のとおり静止画像ではなく svg の図形のみ（上＝∩・下＝∪の2つ・楕円12枚＋点1つずつ・装飾なので読み上げない）', () => {
    const block = toCelebrateBootHtml(BOOT_LOGO_WHITE, 'white').match(BLOCK)![0]
    const svgs = block.match(/<svg[\s\S]*?<\/svg>/g)!
    expect(svgs).toHaveLength(2)
    for (const svg of svgs) {
      expect(count(svg, '<ellipse')).toBe(12)
      expect(count(svg, '<circle')).toBe(1)
      expect(svg).toContain('aria-hidden="true"')
      expect(svg).not.toMatch(/<image|<use|href=|<text|<path/)
    }
    // 下の弧は上の弧を上下反転しただけ（同じ図形）。
    expect(svgs[1]).toContain('scale(1 -1)')
    expect(svgs[0]).not.toContain('scale(1 -1)')
  })

  it('文言は2つの葉の弧に挟まれている（上の弧 → 題 → 名 → 下の弧）', () => {
    const block = toCelebrateBootHtml(BOOT_LOGO_WHITE, 'white').match(BLOCK)![0]
    const iUp = block.indexOf('<svg')
    const iTitle = block.indexOf(CELEBRATION_COPY.bootTitle)
    const iName = block.indexOf(CELEBRATION_COPY.bootName)
    const iDown = block.lastIndexOf('<svg')
    expect(iUp).toBeGreaterThan(-1)
    expect(iUp).toBeLessThan(iTitle)
    expect(iTitle).toBeLessThan(iName)
    expect(iName).toBeLessThan(iDown)
  })
})

describe('小さい端末でも、お祝いのブロックが状態バーに掛からない（画面の高さごとの寸法の段階）', () => {
  it('段階は高さの小さい順に厳しくなり（弧も余白も縮む）、通常は 弧 220x25・あき 6 と 14（本人指定の間隔）のまま', () => {
    const [normal, compact, tight, tiny] = SIZE_TIERS
    expect(normal).toMatchObject({ arcW: 220, arcH: 25, gapText: 6, gapLogo: 14 })
    expect(compact.maxHeight).toBeLessThan(700.0001)
    for (const [a, b] of [[normal, compact], [compact, tight], [tight, tiny]] as const) {
      expect(b.arcH).toBeLessThan(a.arcH)
      expect(b.gapText).toBeLessThanOrEqual(a.gapText)
      expect(b.gapLogo).toBeLessThan(a.gapLogo)
      expect(b.maxHeight).toBeLessThan(a.maxHeight)
      // 縦横比は同じ（図形がつぶれない）
      expect(Math.abs(b.arcW / b.arcH - 220 / 25)).toBeLessThan(0.7)
    }
  })

  it('高さ592〜1000dp の全画面で、ブロックの上端が状態バー（24dp）より下（＝掛からない）', () => {
    for (let h = 592; h <= 1000; h++) {
      expect(celebrateBlockTop(h), `H=${h}`).toBeGreaterThanOrEqual(STATUS_BAR_DP)
    }
  })

  it('実測（Chrome で起動 HTML を測った値・2026-10-08）と式が一致する: 高さ915/700/640/620/600/592 でのブロックの上端', () => {
    const measured: Array<[number, number]> = [[915, 149], [700, 63.5], [640, 33.5], [620, 35.5], [600, 37.5], [592, 33.5]]
    for (const [h, top] of measured) expect(celebrateBlockTop(h)).toBeCloseTo(top, 5)
    expect((915 - LOGO_COLUMN_HEIGHT) / 2).toBe(264) // ロゴの上端の実測
  })

  it('段階の選び方: 境界の高さ（700・620・600）は小さい方の段階。CSS の @media（max-height）と同じ境界', () => {
    expect(sizeTierForHeight(701).name).toBe('normal')
    expect(sizeTierForHeight(700).name).toBe('compact')
    expect(sizeTierForHeight(621).name).toBe('compact')
    expect(sizeTierForHeight(620).name).toBe('tight')
    expect(sizeTierForHeight(601).name).toBe('tight')
    expect(sizeTierForHeight(600).name).toBe('tiny')
    expect(celebrateBlockHeight(915)).toBe(115)
    expect(celebrateBlockHeight(640)).toBe(93)
  })

  it.each(BASES)('%s: HTML の @media の境界と寸法が、SIZE_TIERS（検査した値）と同じ', (_n, variant, base) => {
    const out = toCelebrateBootHtml(base, variant)
    for (const t of SIZE_TIERS) {
      const css =
        `.celeb{margin-bottom:${t.gapLogo}px}.celeb svg{display:block;width:${t.arcW}px;height:${t.arcH}px}` +
        `.celeb .celeb-up{margin-bottom:${t.gapText}px}.celeb .celeb-down{margin-top:${t.gapText}px}`
      expect(out).toContain(t.maxHeight === Infinity ? css : `@media (max-height:${t.maxHeight}px){${css}}`)
    }
    // 小さい段階が後ろ（同じ強さの規則では後ろが勝つ）
    const i = (n: number) => out.indexOf(`@media (max-height:${n}px)`)
    expect(i(700)).toBeLessThan(i(620))
    expect(i(620)).toBeLessThan(i(600))
  })
})
