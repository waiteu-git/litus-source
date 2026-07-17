import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { toDarkBootHtml, BOOT_LOGO_DARK } from './bootLogoDark'
import { BOOT_LOGO_WHITE } from './bootLogoHtml'
import { WARM_BOOT_LOGO_DARK } from './bootLogoWarm'
import { DARK, COLORS } from '../theme.palette'

/** base64のデータURI（フォント/画像）を除いた本体。色の検査を埋め込みデータで汚さない。 */
function stripEmbedded(html: string): string {
  return html.replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/g, '<<<embedded>>>')
}

describe('toDarkBootHtml', () => {
  it('白版の色をダークの色へ置き換える', () => {
    expect(toDarkBootHtml('background:#ffffff')).toBe('background:#0f1713')
    expect(toDarkBootHtml('color:#12332a')).toBe('color:#eaf3ef')
    expect(toDarkBootHtml('color:#0f9e75')).toBe('color:#37c99b')
  })

  it('未知の色は素通しする（生成物が将来変わっても壊れない）', () => {
    expect(toDarkBootHtml('color:#123456')).toBe('color:#123456')
  })

  it('1パスで置換する（置換後の色が次の規則に再マッチしない）', () => {
    // #ffffff→#0f1713 の後で #0f1713 が別規則に食われない
    expect(toDarkBootHtml('a:#ffffff;b:#12332a')).toBe('a:#0f1713;b:#eaf3ef')
  })

  it('boltのフィルタを明度上げへ差し替える', () => {
    expect(toDarkBootHtml('filter:none')).toBe('filter:brightness(1.3)')
  })
})

describe('BOOT_LOGO_DARK', () => {
  const body = stripEmbedded(BOOT_LOGO_DARK)

  it('白版の色が1つも残っていない', () => {
    for (const stale of ['#ffffff', '#12332a', '#0f9e75', '#a7bcb3', '#8a968f', '#e3ebe7', '#b4bfba']) {
      expect(body).not.toContain(stale)
    }
  })

  it('翠テーマのグラデーションを持ち込まない（ダークで緑の閃光を出さないこと）', () => {
    expect(body).not.toContain('#18b892')
    expect(body).not.toContain('#0d7256')
    expect(body).not.toContain('linear-gradient')
  })

  it('地色はDARK.bg', () => {
    expect(body).toContain(`background:${DARK.bg}`)
  })

  it('翠アクセントはCOLORS.emeraldLight（ダークの指定色）', () => {
    expect(body).toContain(`color:${COLORS.emeraldLight}`)
  })

  it('LITUSの5文字とリタスが残っている（構造を壊していない）', () => {
    expect(body).toContain('>L<')
    expect(body).toContain('>S<')
    expect(body).toContain('リ')
    expect(body).toContain('タ')
    expect(body).toContain('ス')
  })

  it('白版と構造は同一（差分は色とフィルタのみ）', () => {
    const white = stripEmbedded(BOOT_LOGO_WHITE)
    const normalize = (s: string) =>
      s.replace(/#[0-9a-fA-F]{6}|rgba\([^)]*\)|filter:[^;"]+/g, 'C')
    expect(normalize(body)).toBe(normalize(white))
  })
})

describe('WARM_BOOT_LOGO_DARK', () => {
  it('ダークの色を保ったままループ短縮版になる', () => {
    const body = stripEmbedded(WARM_BOOT_LOGO_DARK)
    expect(body).toContain(DARK.bg)
    expect(body).not.toContain('#ffffff')
    expect(WARM_BOOT_LOGO_DARK).toContain('0s infinite')
  })
})

describe('ネイティブスプラッシュとの一致（フラッシュ抑制の要）', () => {
  it('起動アニメの地色がapp.jsonのsplash.dark.backgroundColorと一致する', () => {
    // 一致していないとネイティブスプラッシュ→起動アニメの瞬間に色が飛ぶ（＝ダーク起動時のフラッシュ）。
    // どちらかを変えるときは必ず両方揃えること。
    const appJson = JSON.parse(readFileSync(join(__dirname, '..', '..', 'app.json'), 'utf8'))
    const splash = appJson.expo.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen',
    )
    expect(splash[1].dark.backgroundColor).toBe(DARK.bg)
  })
})
