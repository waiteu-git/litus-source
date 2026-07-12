import type { ResolvedVariant } from './storage/themeSerialize'
import { COLORS, DARK } from './theme.palette'

/**
 * variant から画面共通の色トークンを解決する純粋関数（React Native非依存＝vitestで検証可能）。
 * 翠(green)/白(white)の値は従来の screen.tsx 内インライン分岐と1対1で一致させ、
 * dark 分岐のみ新規追加している（＝翠/白は無変更、darkだけ実配色を足す）。
 *
 * gradient!==null の variant（green/dark）は ScreenBg でグラデ地、null（white）は単色地。
 */
export type UiColors = {
  /** 画面地のグラデ端色。null の variant は単色地（screenSolid）。 */
  gradient: [string, string] | null
  /** グラデを使わない variant の単色地。 */
  screenSolid: string
  /** ヘッダタイトル/アイコン・アコーディオン見出しの色。 */
  heading: string
  valueColor: string
  labelColor: string
  dividerColor: string
  cardBg: string
  cardBorder: string
  /** カード上のアイコン/強調アクセント（旧 green?'#fff':emerald）。 */
  accent: string
  /** 控えめなアクセント文字（旧 green?'#eafff7':emerald）。 */
  accentSoft: string
  /** タグ/バッジ/アイコン下地（旧 green?'rgba(255,255,255,0.5)':'#d6efe4'）。 */
  pillBg: string
  /** タグ/バッジ文字（旧 green?'#04322a':emeraldDark）。 */
  pillText: string
  /** 統計ボックス等の淡い下地（旧 green?'rgba(255,255,255,0.24)':'#e8f4ee'）。 */
  softBoxBg: string
  /** 送り山括弧などのミュート色（旧 green?'rgba(255,255,255,0.7)':'#9bb3ab'）。 */
  chevron: string
  /** 二次的なミュート文字（旧 green?'#eafff7':'#8a968f'）。 */
  subMuted: string
  /** 入力欄/コードセルの下地・境界。 */
  inputBg: string
  inputBorder: string
  /** セグメント（選択ピル）の境界/選択時地/選択時文字/非選択文字。 */
  segBorder: string
  segOnBg: string
  segOnText: string
  segOffText: string
  /** ヘッダーChipの下地/文字/境界。 */
  chipBg: string
  chipText: string
  chipBorder: string
}

const GREEN: UiColors = {
  gradient: [COLORS.gradTop, COLORS.gradBottom],
  screenSolid: COLORS.gradBottom,
  heading: COLORS.white,
  valueColor: COLORS.inkOnGlass,
  labelColor: COLORS.labelOnGlass,
  dividerColor: 'rgba(255,255,255,0.35)',
  cardBg: 'rgba(255,255,255,0.36)',
  cardBorder: 'rgba(255,255,255,0.55)',
  accent: '#ffffff',
  accentSoft: '#eafff7',
  pillBg: 'rgba(255,255,255,0.5)',
  pillText: '#04322a',
  softBoxBg: 'rgba(255,255,255,0.24)',
  chevron: 'rgba(255,255,255,0.7)',
  subMuted: '#eafff7',
  inputBg: 'rgba(255,255,255,0.42)',
  inputBorder: 'rgba(255,255,255,0.7)',
  segBorder: 'rgba(255,255,255,0.4)',
  segOnBg: 'rgba(255,255,255,0.7)',
  segOnText: '#04322a',
  segOffText: '#eafff7',
  chipBg: 'rgba(255,255,255,0.42)',
  chipText: '#04322a',
  chipBorder: 'rgba(255,255,255,0.5)',
}

const WHITE: UiColors = {
  gradient: null,
  screenSolid: '#ffffff',
  heading: COLORS.emeraldDark,
  valueColor: COLORS.ink,
  labelColor: COLORS.emeraldDark,
  dividerColor: '#e3ece8',
  cardBg: COLORS.white,
  cardBorder: '#e3ece8',
  accent: COLORS.emerald,
  accentSoft: COLORS.emerald,
  pillBg: '#d6efe4',
  pillText: COLORS.emeraldDark,
  softBoxBg: '#e8f4ee',
  chevron: '#9bb3ab',
  subMuted: '#8a968f',
  inputBg: '#f1f8f5',
  inputBorder: '#b9ddcd',
  segBorder: '#cfe0d9',
  segOnBg: COLORS.emerald,
  segOnText: COLORS.white,
  segOffText: COLORS.emeraldDark,
  chipBg: '#d6efe4',
  chipText: COLORS.emeraldDark,
  chipBorder: 'transparent',
}

const DARK_TOKENS: UiColors = {
  gradient: [DARK.gradTop, DARK.gradBottom],
  screenSolid: DARK.bg,
  heading: DARK.heading,
  valueColor: DARK.value,
  labelColor: DARK.label,
  dividerColor: DARK.divider,
  cardBg: DARK.card,
  cardBorder: DARK.cardBorder,
  accent: COLORS.emeraldLight,
  accentSoft: COLORS.emeraldLight,
  pillBg: DARK.pillBg,
  pillText: COLORS.emeraldLight,
  softBoxBg: DARK.softBox,
  chevron: DARK.chevron,
  subMuted: DARK.label,
  inputBg: DARK.inputBg,
  inputBorder: DARK.inputBorder,
  segBorder: DARK.segBorder,
  segOnBg: COLORS.emerald,
  segOnText: COLORS.white,
  segOffText: DARK.label,
  chipBg: DARK.chipBg,
  chipText: COLORS.emeraldLight,
  chipBorder: DARK.chipBorder,
}

export function resolveUiColors(variant: ResolvedVariant): UiColors {
  if (variant === 'green') return GREEN
  if (variant === 'dark') return DARK_TOKENS
  return WHITE
}
