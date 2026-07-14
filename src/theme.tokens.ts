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
  /** 意味色ロール（「色が付いている＝異常」。通常状態には使わない）。 */
  danger: string
  dangerBg: string
  warn: string
  warnBg: string
  info: string
  infoBg: string
  success: string
  successBg: string
  /** 最優先の縁（「いまの授業」専用）。翠地=明るい白縁／白=緑縁／夜の翠=翠縁。 */
  priorityBorder: string
  /** 時間割グリッドの状態別セル背景（空/授業あり/今日/現在コマ）とセル文字。単一意味色ロールに収まらないドメイン色ランプ。 */
  gridCellEmptyBg: string
  gridCellFilledBg: string
  gridCellTodayBg: string
  gridCellNowBg: string
  gridCellText: string
  /** 科目「実施パターン」の休み週バッジ（背景/文字）。異常ではなく状態区別のドメイン色。 */
  patternOffBg: string
  patternOffText: string
  /** ポジティブ/中立マーカー（異常でない注目色）。favorite=お気に入り星塗り・flagAccent=掲示フラグ・updateDot=更新ありドット。 */
  favorite: string
  flagAccent: string
  updateDot: string
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
  danger: '#b3261e',
  dangerBg: '#fdecea',
  warn: COLORS.warnStrong,
  warnBg: COLORS.warnBg,
  info: COLORS.info,
  infoBg: COLORS.infoBg,
  success: COLORS.success,
  successBg: COLORS.successBg,
  priorityBorder: 'rgba(255,255,255,0.72)',
  gridCellEmptyBg: 'rgba(255,255,255,0.16)',
  gridCellFilledBg: 'rgba(255,255,255,0.5)',
  gridCellTodayBg: 'rgba(255,255,255,0.62)',
  gridCellNowBg: 'rgba(255,255,255,0.88)',
  gridCellText: '#04322a',
  patternOffBg: '#f2ddd6',
  patternOffText: '#a33417',
  favorite: '#f5a623',
  flagAccent: '#e0a100',
  updateDot: '#e8a400',
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
  danger: COLORS.danger,
  dangerBg: COLORS.dangerBg,
  warn: COLORS.warnStrong,
  warnBg: COLORS.warnBg,
  info: COLORS.info,
  infoBg: COLORS.infoBg,
  success: COLORS.success,
  successBg: COLORS.successBg,
  priorityBorder: '#a3d4bf',
  gridCellEmptyBg: '#f3f7f5',
  gridCellFilledBg: '#e8f4ee',
  gridCellTodayBg: '#d6efe4',
  gridCellNowBg: '#c3ead7',
  gridCellText: COLORS.ink,
  patternOffBg: '#f2ddd6',
  patternOffText: '#a33417',
  favorite: '#f5a623',
  flagAccent: '#e0a100',
  updateDot: '#e8a400',
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
  danger: DARK.danger,
  dangerBg: DARK.dangerBg,
  warn: DARK.warn,
  warnBg: DARK.warnBg,
  info: DARK.info,
  infoBg: DARK.infoBg,
  success: DARK.success,
  successBg: DARK.successBg,
  priorityBorder: DARK.priorityBorder,
  gridCellEmptyBg: DARK.gridEmpty,
  gridCellFilledBg: DARK.gridFilled,
  gridCellTodayBg: DARK.gridToday,
  gridCellNowBg: DARK.gridNow,
  gridCellText: DARK.value,
  patternOffBg: DARK.patternOffBg,
  patternOffText: DARK.patternOffText,
  favorite: DARK.favorite,
  flagAccent: DARK.flag,
  updateDot: DARK.updateDot,
}

export function resolveUiColors(variant: ResolvedVariant): UiColors {
  if (variant === 'green') return GREEN
  if (variant === 'dark') return DARK_TOKENS
  return WHITE
}
