import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BOOT_FADE_MS, bootChrome, bootLogoHtml, nativeSplashBg, needsBootFade } from './bootTheme'
import { COLORS, DARK } from '../theme.palette'
import { BOOT_LOGO_GREEN, BOOT_LOGO_WHITE } from '../screens/bootLogoHtml'
import { BOOT_LOGO_DARK } from '../screens/bootLogoDark'
import {
  WARM_BOOT_LOGO_GREEN,
  WARM_BOOT_LOGO_WHITE,
  WARM_BOOT_LOGO_DARK,
} from '../screens/bootLogoWarm'

describe('bootChrome', () => {
  it('3バリアントそれぞれ別の下地色を返す', () => {
    expect(bootChrome('white').bg).toBe(COLORS.white)
    expect(bootChrome('green').bg).toBe(COLORS.gradBottom)
    expect(bootChrome('dark').bg).toBe(DARK.bg)
  })

  it('ダークは翠の下地へ落ちない（緑フラッシュの回帰防止）', () => {
    // 旧実装は bootWhite = variant === 'white' の2値判定で、dark が green 扱いになっていた。
    expect(bootChrome('dark').bg).not.toBe(bootChrome('green').bg)
    expect(bootChrome('dark').bg).not.toBe(COLORS.gradBottom)
  })

  it('接続状況テキストは下地ごとに色を変える', () => {
    expect(bootChrome('white').statusColor).toBe(COLORS.bootLabelOnWhite)
    expect(bootChrome('green').statusColor).toBe(COLORS.whiteSubtle90)
    expect(bootChrome('dark').statusColor).toBe(DARK.label)
  })
})

describe('bootLogoHtml', () => {
  it('fullは各バリアントのフル版', () => {
    expect(bootLogoHtml('white', 'full')).toBe(BOOT_LOGO_WHITE)
    expect(bootLogoHtml('green', 'full')).toBe(BOOT_LOGO_GREEN)
    expect(bootLogoHtml('dark', 'full')).toBe(BOOT_LOGO_DARK)
  })

  it('warmは各バリアントの短縮版', () => {
    expect(bootLogoHtml('white', 'warm')).toBe(WARM_BOOT_LOGO_WHITE)
    expect(bootLogoHtml('green', 'warm')).toBe(WARM_BOOT_LOGO_GREEN)
    expect(bootLogoHtml('dark', 'warm')).toBe(WARM_BOOT_LOGO_DARK)
  })

  it('ダークは翠版のHTMLへ落ちない（緑フラッシュの回帰防止）', () => {
    expect(bootLogoHtml('dark', 'full')).not.toBe(BOOT_LOGO_GREEN)
    expect(bootLogoHtml('dark', 'warm')).not.toBe(WARM_BOOT_LOGO_GREEN)
  })

  it('全バリアント×全モードが相異なる（取り違えの検出）', () => {
    const all = (['white', 'green', 'dark'] as const).flatMap((v) =>
      (['full', 'warm'] as const).map((m) => bootLogoHtml(v, m)),
    )
    expect(new Set(all).size).toBe(6)
  })
})

describe('フラッシュ抑制（スプラッシュ→起動画面のクロスフェード）', () => {
  it('ネイティブスプラッシュの色はOSスキームで決まる（テーマではない）', () => {
    // ネイティブスプラッシュは AsyncStorage のテーマ設定を読めないので、OSにしか従えない。
    expect(nativeSplashBg('dark')).toBe(DARK.bg)
    expect(nativeSplashBg('light')).toBe(COLORS.white)
    expect(nativeSplashBg(null)).toBe(COLORS.white)
    expect(nativeSplashBg(undefined)).toBe(COLORS.white)
  })

  it('OSとテーマの色が一致していればフェード不要（無駄な演出をしない）', () => {
    expect(needsBootFade('dark', 'dark')).toBe(false)
    expect(needsBootFade('white', 'light')).toBe(false)
  })

  it('食い違うときだけフェードする', () => {
    // これが本命: テーマ=ダークだがOS=ライト → スプラッシュ白 → 起動画面が暗い
    expect(needsBootFade('dark', 'light')).toBe(true)
    // テーマ=白だがOS=ダーク → スプラッシュ暗 → 起動画面が白
    expect(needsBootFade('white', 'dark')).toBe(true)
    // 翠はどちらのスプラッシュ色とも違う
    expect(needsBootFade('green', 'light')).toBe(true)
    expect(needsBootFade('green', 'dark')).toBe(true)
  })

  it('フェードは200ms', () => {
    expect(BOOT_FADE_MS).toBe(200)
  })
})

describe('app.jsonのsplash色との一致（フェード計算の前提）', () => {
  it('nativeSplashBgがapp.jsonのsplash設定と一致する', () => {
    // ずれるとフェードの開始色が実際のスプラッシュと違い、かえって色が飛ぶ。
    const appJson = JSON.parse(readFileSync(join(__dirname, '..', '..', 'app.json'), 'utf8'))
    const splash = appJson.expo.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen',
    )
    expect(nativeSplashBg('light')).toBe(splash[1].backgroundColor)
    expect(nativeSplashBg('dark')).toBe(splash[1].dark.backgroundColor)
  })
})

describe('bootLogoHtml の第3引数（お祝い）: 既定は従来の6通りと1文字も変わらず、true の時だけお祝いの飾りが付く', () => {
  const cases: Array<['white' | 'green' | 'dark', 'full' | 'warm']> = [
    ['white', 'full'],
    ['green', 'full'],
    ['dark', 'full'],
    ['white', 'warm'],
    ['green', 'warm'],
    ['dark', 'warm'],
  ]

  it.each(cases)('%s/%s: 引数なし＝false 指定＝従来どおり（飾りなし）', (variant, mode) => {
    const legacy = bootLogoHtml(variant, mode)
    expect(bootLogoHtml(variant, mode, false)).toBe(legacy)
    expect(legacy).not.toContain('<div class="celeb"')
  })

  it.each(cases)('%s/%s: true なら飾りが1つ付き、飾り以外は従来と同じ（足すだけ）', (variant, mode) => {
    const base = bootLogoHtml(variant, mode)
    const out = bootLogoHtml(variant, mode, true)
    expect(out).not.toBe(base)
    expect(out.split('<div class="celeb"').length - 1).toBe(1)
    expect(out.length).toBeGreaterThan(base.length)
    // 2回目（キャッシュ）も同じ結果
    expect(bootLogoHtml(variant, mode, true)).toBe(out)
  })

  it('お祝いありの6通りは相異なる（ダークが翠版へ落ちない・warm が full へ落ちない）', () => {
    const all = cases.map(([v, m]) => bootLogoHtml(v, m, true))
    expect(new Set(all).size).toBe(6)
  })
})
