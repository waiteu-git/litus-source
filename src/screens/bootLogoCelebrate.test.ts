import { describe, expect, it } from 'vitest'
import { BOOT_LOGO_GREEN, BOOT_LOGO_WHITE } from './bootLogoHtml'
import { BOOT_LOGO_DARK } from './bootLogoDark'
import { WARM_BOOT_LOGO_DARK, WARM_BOOT_LOGO_GREEN, WARM_BOOT_LOGO_WHITE } from './bootLogoWarm'
import { toCelebrateBootHtml, type CelebrateVariant } from './bootLogoCelebrate'

/**
 * 起動画面の「お祝いの飾り」（月桂樹の輪）は、**原本・ダーク・warm の各 HTML を文字列変換で派生**して足す
 * （bootLogoDark / bootLogoWarm と同じ作法。原本の bootLogoHtml.ts は生成物なので手編集しない）。
 * 輪はロゴの入れ物（144x144）の子として置く＝ロゴと一緒に動く（位置がずれない）・ロゴ列の流れを変えない
 * （boltRise の 121.2px は列の高さの実測値。流れの中に要素を足すとスプラッシュとの継ぎ目が崩れる）。
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

describe('toCelebrateBootHtml: 6通り（3テーマ×full/warm）すべてに、飾りを1つだけ足す', () => {
  it.each(BASES)('%s: 元と違い、輪の svg がちょうど1つ', (_n, variant, base) => {
    const out = toCelebrateBootHtml(base, variant)
    expect(out).not.toBe(base)
    expect(count(out, '<svg class="celeb"')).toBe(1)
    expect(count(base, '<svg class="celeb"')).toBe(0)
  })

  it.each(BASES)('%s: 足したものを取り除くと、元と1文字も違わない（足すだけ・既存を壊さない）', (_n, variant, base) => {
    const out = toCelebrateBootHtml(base, variant)
    const restored = out
      .replace(/<svg class="celeb"[\s\S]*?<\/svg>/, '')
      .replace(/\/\*celeb-start\*\/[\s\S]*?\/\*celeb-end\*\//, '')
      .replace('position:relative;width:144px;height:144px;animation:boltRise', 'width:144px;height:144px;animation:boltRise')
    expect(restored).toBe(base)
  })

  it.each(BASES)('%s: 画像・外部URL・data: を足さない（自前の図形だけ＝出所を数値で説明できる）', (_n, variant, base) => {
    const out = toCelebrateBootHtml(base, variant)
    expect(count(out, '<img')).toBe(count(base, '<img'))
    expect(count(out, 'http')).toBe(count(base, 'http'))
    expect(count(out, 'data:')).toBe(count(base, 'data:'))
    expect(count(out, 'url(')).toBe(count(base, 'url('))
  })

  it.each(BASES)('%s: 輪はロゴの入れ物の中（絶対配置・操作を奪わない）で、ロゴ列の流れを変えない', (_n, variant, base) => {
    const out = toCelebrateBootHtml(base, variant)
    const svg = out.match(/<svg class="celeb"[\s\S]*?<\/svg>/)![0]
    expect(svg).toContain('position:absolute')
    expect(svg).toContain('pointer-events:none')
    // 入れ物（相対配置）の直後・ロゴ画像の前に入る＝ロゴの背面で、ロゴと一緒に動く。
    expect(out).toMatch(/position:relative;width:144px;height:144px;animation:boltRise[^"]*"><svg class="celeb"[\s\S]*?<\/svg><img src="data:image\/png/)
  })

  it.each(BASES)('%s: ロゴの上昇（boltRise）が落ち着く頃に、そっと現れる／視覚効果を減らす設定では動かさない', (_n, variant, base) => {
    const out = toCelebrateBootHtml(base, variant)
    const svg = out.match(/<svg class="celeb"[\s\S]*?<\/svg>/)![0]
    // 0.36s＝規約の祝福の上限（360ms）。
    expect(svg).toMatch(/animation:celebIn 0\.36s cubic-bezier\(0\.16,1,0\.3,1\) 0\.75s both/)
    expect(out).toContain('@keyframes celebIn')
  })

  it.each(BASES)('%s: 視覚効果を減らす設定では、動き（拡大）を外して透明度だけのフェード（最初から不透明にしない）', (_n, variant, base) => {
    const out = toCelebrateBootHtml(base, variant)
    const m = out.match(/@media \(prefers-reduced-motion: ?reduce\)\{\.celeb\{animation:([^}]*)\}\}/)
    expect(m).not.toBeNull()
    // none ではなく、遅延つきのフェード
    expect(m![1]).toMatch(/^celebFade 0\.36s cubic-bezier\(0\.16,1,0\.3,1\) 0\.75s both!important$/)
    const fade = out.match(/@keyframes celebFade\{([^}]*\}[^}]*)\}/)
    expect(fade).not.toBeNull()
    expect(fade![1]).not.toContain('transform')
  })

  it.each(BASES)('%s: 輪の中心はロゴの中心より20px上（下端の葉が CLASS に重ならない）', (_n, variant, base) => {
    const svg = toCelebrateBootHtml(base, variant).match(/<svg class="celeb"[\s\S]*?<\/svg>/)![0]
    expect(svg).toContain('margin:-122px 0 0 -102px')
  })

  it('warm でも輪の動きは「最終状態へ畳まれない」＝warm 変換は先に済んでいて、輪のアニメを触らない', () => {
    const out = toCelebrateBootHtml(WARM_BOOT_LOGO_WHITE, 'white')
    expect(out).toContain('celebIn 0.36s')
    expect(out).not.toMatch(/celebIn 0s/)
  })

  it('バリアントごとに色が違う（白地で象牙は消える・翠地で翠は消える）', () => {
    const fills = (h: string) => new Set(h.match(/<svg class="celeb"[\s\S]*?<\/svg>/)![0].match(/fill="#[0-9a-f]{6}"/gi))
    const w = fills(toCelebrateBootHtml(BOOT_LOGO_WHITE, 'white'))
    const g = fills(toCelebrateBootHtml(BOOT_LOGO_GREEN, 'green'))
    const d = fills(toCelebrateBootHtml(BOOT_LOGO_DARK, 'dark'))
    expect([...w].join()).not.toBe([...g].join())
    expect([...w].join()).not.toBe([...d].join())
    expect([...g].join()).not.toBe([...d].join())
  })

  it('二重に足さない（すでに輪がある HTML はそのまま返す）', () => {
    const once = toCelebrateBootHtml(BOOT_LOGO_WHITE, 'white')
    expect(toCelebrateBootHtml(once, 'white')).toBe(once)
  })

  it('足す場所（ロゴの入れ物）が見つからない HTML は、何もせず元のまま返す（生成物が将来変わっても起動を壊さない）', () => {
    const odd = '<html><body><div>no logo here</div></body></html>'
    expect(toCelebrateBootHtml(odd, 'white')).toBe(odd)
  })

  it('輪は規約のとおり静止画像ではなく svg の図形のみ（楕円16枚＋点1つ）', () => {
    const svg = toCelebrateBootHtml(BOOT_LOGO_WHITE, 'white').match(/<svg class="celeb"[\s\S]*?<\/svg>/)![0]
    expect(count(svg, '<ellipse')).toBe(16)
    expect(count(svg, '<circle')).toBe(1)
    expect(svg).not.toMatch(/<image|<use|href=|<text|<path/)
  })
})
