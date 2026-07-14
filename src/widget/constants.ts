/** ウィジェット名（app.json の widgets 定義・タスクハンドラ・更新要求で共有する唯一の定義）。 */
export const WIDGET_MAIN = 'LitusToday'
export const WIDGET_COMPACT = 'LitusNext'
export const WIDGET_NAMES = [WIDGET_MAIN, WIDGET_COMPACT] as const

/**
 * ウィジェット配色（デザインシステムのトークンに整合。theme.tsx を import すると RN の
 * ThemeProvider 連鎖を引くため独立定義にするが、値は `styles.css`/`theme.palette` の翠ライトと一致させる）。
 * react-native-android-widget はグラデ不可のため、翠グラデはアイデンティティ面の下端色 gradBottom を単色採用する。
 */
export const WIDGET_COLORS = {
  bgTop: '#18b892', // grad-top
  bgBottom: '#0d7256', // grad-bottom（単色地）
  card: '#ffffff', // surface
  cardInk: '#12332a', // ink
  cardSub: '#8a968f', // muted
  accent: '#0f9e75', // accent
  onDark: '#ffffff',
  onDarkDim: '#bfe0d4',
  remoteBadgeBg: '#18b892',
  danger: '#b3261e', // 意味色 danger（旧 #e0533a を刷新）
  dangerBg: '#fdecea',
  warn: '#9a5b00',
  warnBg: '#fdf3e1',
  info: '#1c5fb2',
  infoBg: '#e8f1fb',
  success: '#0b6b2f',
  successBg: '#e6f4ea',
  attendBg: '#0aa579', // cta
  pillBg: '#d6efe4',
  pillText: '#0a6650',
} as const
