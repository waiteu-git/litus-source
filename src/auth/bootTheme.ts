/**
 * 起動画面（ロゴアニメ）のテーマ別の見た目を決める（純粋・RN非依存）。
 *
 * 従来は `bootWhite = variant === 'white'` の**2値判定**で分岐しており、`variant === 'dark'` が
 * 翠版へフォールバックしていた。結果、ダークテーマの利用者は起動のたびに
 * **翠グラデーションの閃光を見てから暗いUIへ落ちる**という不具合になっていた（2026-07-17 修正）。
 * バリアントは3つあるので、分岐も3つ持つ。
 */
import { BOOT_LOGO_GREEN, BOOT_LOGO_WHITE } from '../screens/bootLogoHtml'
import { BOOT_LOGO_DARK } from '../screens/bootLogoDark'
import {
  WARM_BOOT_LOGO_GREEN,
  WARM_BOOT_LOGO_WHITE,
  WARM_BOOT_LOGO_DARK,
} from '../screens/bootLogoWarm'
import { COLORS, DARK } from '../theme.palette'
import type { ResolvedVariant } from '../storage/themeSerialize'

/** full=フルイントロ／warm=その日2回目以降のループのみ版。 */
export type BootMode = 'full' | 'warm'

export type BootChrome = {
  /**
   * 起動画面の下地色。**ネイティブスプラッシュから引き継ぐ色**であり、WebViewのHTMLが描画される
   * までの一瞬もこの色が見える。ダークは app.json の splash.dark.backgroundColor と同値
   * （＝OSダーク時はスプラッシュから起動アニメまで色が動かない）。
   */
  bg: string
  /** 接続状況テキストの色（下地の上で読めること）。 */
  statusColor: string
}

export function bootChrome(variant: ResolvedVariant): BootChrome {
  if (variant === 'dark') return { bg: DARK.bg, statusColor: DARK.label }
  if (variant === 'white') return { bg: COLORS.white, statusColor: COLORS.bootLabelOnWhite }
  // 翠版は自前でグラデ背景を描くため、下地はグラデ終端に合わせる。
  return { bg: COLORS.gradBottom, statusColor: COLORS.whiteSubtle90 }
}

/** ネイティブスプラッシュ→起動画面のクロスフェード時間(ms)。 */
export const BOOT_FADE_MS = 200

/**
 * ネイティブスプラッシュが実際に表示していた色。
 *
 * ネイティブスプラッシュは**OSのカラースキームにしか従えない**（AsyncStorageのテーマ設定を読めない）。
 * app.json の splash は light=#ffffff / dark=#0f1713。一方アプリのテーマはユーザー選択なので、
 * 「テーマ=ダーク・OS=ライト」だとスプラッシュ(白)→起動画面(暗)で**色が飛ぶ**。
 * この色から bootChrome().bg へ BOOT_FADE_MS でクロスフェードさせ、飛びを意図的な遷移に変える。
 * OSとテーマが一致していれば同色なので、フェードしても見た目は変わらない（無害）。
 * **app.json の splash の色を変えたらここも合わせること**（テストで固定している）。
 */
export function nativeSplashBg(scheme: 'light' | 'dark' | null | undefined): string {
  return scheme === 'dark' ? DARK.bg : COLORS.white
}

/** スプラッシュ色と起動画面色が違う＝フェードで繋ぐ必要があるか。 */
export function needsBootFade(
  variant: ResolvedVariant,
  scheme: 'light' | 'dark' | null | undefined,
): boolean {
  return nativeSplashBg(scheme) !== bootChrome(variant).bg
}

export function bootLogoHtml(variant: ResolvedVariant, mode: BootMode): string {
  if (mode === 'warm') {
    if (variant === 'dark') return WARM_BOOT_LOGO_DARK
    return variant === 'white' ? WARM_BOOT_LOGO_WHITE : WARM_BOOT_LOGO_GREEN
  }
  if (variant === 'dark') return BOOT_LOGO_DARK
  return variant === 'white' ? BOOT_LOGO_WHITE : BOOT_LOGO_GREEN
}
