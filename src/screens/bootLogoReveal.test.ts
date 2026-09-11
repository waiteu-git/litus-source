/**
 * 起動アニメで、上がってくるロゴと LITUS の文字が重ならないためのラチェット（2026-09-11・build 215）。
 *
 * 214 で入れたロゴの上昇（boltRise＝画面中央・スプラッシュと同じ大きさから定位置へ）と、warm 版（その日2回目以降）の
 * 短縮変換（イントロの both を 0s に畳む＝LITUS が t=0 から出る）が組み合わさり、t=0〜0.18s にロゴが文字に重なった
 * （実機報告）。直し方＝LITUS の文字の層が fadeUp … 0.3s backwards で上昇を待つ。backwards なので warm 変換を
 * 素通りし、warm でも同じ待ちが残る。数値の根拠と余裕は bootLogoHtml.ts の冒頭コメント（画素で計測）。
 *
 * どれも型チェック・ビルド・既存テストを素通りし、実機の2回目以降の起動でしか見えない壊れ方を止める:
 *   ・待ちが消える／層がずれる（文字ブロック全体に移すと full の CLASS/LETUS まで薄くなる）
 *   ・warm 変換が backwards まで畳むようになる（warm で重なりが戻る）
 *   ・待ちが長すぎて warm の画面（〜1.4s）で LITUS が読めない
 *   ・上昇の始まり（スプラッシュとの一致）が変わる＝待ちの数値の前提が崩れる
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BOOT_LOGO_GREEN, BOOT_LOGO_WHITE } from './bootLogoHtml'
import { BOOT_LOGO_DARK } from './bootLogoDark'
import { toWarmBootHtml, WARM_BOOT_LOGO_DARK, WARM_BOOT_LOGO_GREEN, WARM_BOOT_LOGO_WHITE } from './bootLogoWarm'

const RISE = 'animation:boltRise 0.9s cubic-bezier(0.16,1,0.3,1) 0.15s backwards;'
const RISE_FROM = '0%{transform:translateY(121.2px) scale(1.3889)}'
const REVEAL = 'animation:fadeUp 0.6s cubic-bezier(0.16,1,0.3,1) 0.3s backwards;'
// LITUS の文字の層（CLASS・LETUS の2層の上に重なる3枚目。overflow:hidden を持つのはこの層だけ）
const LITUS_LAYER = /<div style="position:absolute;inset:0;display:flex;align-items:center;font-weight:700;overflow:hidden;[^"]*">/g

const count = (s: string, sub: string) => s.split(sub).length - 1

describe('🔴 LITUS の文字の層はロゴの上昇を待つ（ロゴと文字の重なり防止）', () => {
  const variants: Array<[string, string]> = [
    ['白 full', BOOT_LOGO_WHITE],
    ['翠 full', BOOT_LOGO_GREEN],
    ['ダーク full', BOOT_LOGO_DARK],
    ['白 warm', WARM_BOOT_LOGO_WHITE],
    ['翠 warm', WARM_BOOT_LOGO_GREEN],
    ['ダーク warm', WARM_BOOT_LOGO_DARK],
  ]
  for (const [name, html] of variants) {
    it(`${name}: 待ちは LITUS の層だけに1回あり、ロゴの上昇（始まりの位置と大きさも）と組で残っている`, () => {
      const layers = html.match(LITUS_LAYER) ?? []
      expect(layers).toHaveLength(1)
      expect(layers[0]).toContain(REVEAL)
      expect(count(html, REVEAL)).toBe(1)
      expect(count(html, RISE)).toBe(1)
      expect(html).toContain(RISE_FROM)
    })
  }

  it('原本（bootLogoHtml.ts）には白版・翠版の2か所だけ', () => {
    expect(count(readFileSync('src/screens/bootLogoHtml.ts', 'utf8'), REVEAL)).toBe(2)
  })

  it('待ちは backwards＝warm 変換で畳まれない（畳むと warm で重なりが戻る）', () => {
    expect(toWarmBootHtml(REVEAL)).toBe(REVEAL)
    expect(toWarmBootHtml(RISE)).toBe(RISE)
  })

  it('待ちの終わりは 1.2s 以内（warm の画面は 〜1.4s しか映らない）', () => {
    const m = REVEAL.match(/ (\d+(?:\.\d+)?)s cubic-bezier\([^)]*\) (\d+(?:\.\d+)?)s backwards/)
    expect(m).not.toBeNull()
    expect(Number(m![1]) + Number(m![2])).toBeLessThanOrEqual(1.2)
  })
})
