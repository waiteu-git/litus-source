import { describe, it, expect } from 'vitest'
import {
  BOOT_FOOTER_BOTTOM,
  BOOT_FOOTER_FONT,
  BOOT_FOOTER_LINE,
  BOOT_STATUS_GAP,
  bootStatusBottom,
} from './bootFooterGeometry'
import { BOOT_LOGO_WHITE, BOOT_LOGO_GREEN } from './bootLogoHtml'

const HTMLS: Array<[string, string]> = [
  ['白版', BOOT_LOGO_WHITE],
  ['緑版', BOOT_LOGO_GREEN],
]

describe('起動フッターの座標が HTML と一致している', () => {
  // HTML は自動生成物。再生成で座標が変わったらここが落ちる＝写した定数が黙って腐らない。
  for (const [name, html] of HTMLS) {
    it(`${name}: フッターは bottom:calc(${BOOT_FOOTER_BOTTOM}px + env(safe-area-inset-bottom))`, () => {
      expect(html).toContain(`bottom:calc(${BOOT_FOOTER_BOTTOM}px + env(safe-area-inset-bottom))`)
    })
    it(`${name}: フッターの font-size は ${BOOT_FOOTER_FONT}px`, () => {
      const i = html.indexOf('© 2026 waiteu')
      expect(i).toBeGreaterThanOrEqual(0)
      expect(html.slice(Math.max(0, i - 400), i)).toContain(`font-size:${BOOT_FOOTER_FONT}px`)
    })
    it(`${name}: env() が効く前提（viewport-fit=cover）`, () => {
      expect(html).toContain('viewport-fit=cover')
    })
  }
})

describe('接続状況テキストはフッターと重ならない', () => {
  // 旧実装は bottom:84 の固定値だった。iPhone のホームインジケータ（≈34pt）を数えていないので
  // フッターの上端（40+34+18=92）を下回り、実機で重なった。
  const OLD_FIXED = 84

  it('ホームインジケータのある端末で、旧固定値は実際に重なっていた（回帰の再現）', () => {
    const footerTop = BOOT_FOOTER_BOTTOM + 34 + BOOT_FOOTER_LINE
    expect(OLD_FIXED).toBeLessThan(footerTop)
  })

  it('どの inset でもフッター上端より上に出る', () => {
    for (const inset of [0, 16, 24, 34, 48]) {
      const footerTop = BOOT_FOOTER_BOTTOM + inset + BOOT_FOOTER_LINE
      expect(bootStatusBottom(inset), `inset=${inset}`).toBeGreaterThanOrEqual(footerTop)
    }
  })

  it('余白は inset によらず一定（見え方が端末で変わらない）', () => {
    for (const inset of [0, 24, 34, 48]) {
      const footerTop = BOOT_FOOTER_BOTTOM + inset + BOOT_FOOTER_LINE
      expect(bootStatusBottom(inset) - footerTop).toBe(BOOT_STATUS_GAP)
    }
  })

  it('負やNaN相当の inset でも縮まない', () => {
    expect(bootStatusBottom(-10)).toBe(bootStatusBottom(0))
  })
})
