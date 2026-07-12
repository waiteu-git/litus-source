/**
 * 配色パレット（React Native非依存＝vitestで参照可能）。
 * COLORS は翠/白テーマ共通の基準色。DARK はダークテーマ専用の地色・前景。
 * theme.tsx はここから COLORS を re-export する（従来の `import { COLORS } from '../theme'` は不変）。
 */
export const COLORS = {
  emerald: '#0f9e75',
  emeraldDark: '#0a6650',
  emeraldDeep: '#0b5e4a',
  /** ダーク地でも視認できる明るい翠アクセント（アイコン/リンク文字用）。 */
  emeraldLight: '#37c99b',
  cta: '#0aa579',
  white: '#ffffff',
  ink: '#12332a',
  inkOnGlass: '#053a2c',
  labelOnGlass: '#0b5140',
  tint: '#eef5f2',
  gradTop: '#18b892',
  gradBottom: '#0d7256',
  success: '#0b6b2f',
  successBg: '#e6f4ea',
  warn: '#b26a00',
  danger: '#b3261e',
  dangerBg: '#fdecea',
}

/** ダークテーマの地色・前景・境界。翠アクセントは COLORS.emeraldLight を流用する。 */
export const DARK = {
  gradTop: '#16211c',
  gradBottom: '#0c1310',
  /** 単色地（Web/PDFビューア等の白飛び回避用）。 */
  bg: '#0f1713',
  card: '#1b2621',
  cardBorder: 'rgba(255,255,255,0.08)',
  heading: '#eaf3ef',
  value: '#e6efeb',
  label: '#93a69e',
  divider: 'rgba(255,255,255,0.10)',
  pillBg: 'rgba(55,201,155,0.15)',
  softBox: 'rgba(255,255,255,0.05)',
  chevron: '#5f6f68',
  inputBg: 'rgba(255,255,255,0.05)',
  inputBorder: 'rgba(255,255,255,0.14)',
  segBorder: 'rgba(255,255,255,0.14)',
  chipBg: 'rgba(255,255,255,0.08)',
  chipBorder: 'rgba(255,255,255,0.10)',
}
