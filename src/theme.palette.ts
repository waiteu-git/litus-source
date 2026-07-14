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
  warnStrong: '#9a5b00',
  info: '#1c5fb2',
  infoBg: '#e8f1fb',
  warnBg: '#fdf3e1',
  // イベント種別タグ（白文字の単色タグ・テーマ非依存＝分類色。異常系の意味色ロールではない）。
  eventQuiz: '#3a7be0',
  eventExam: '#7a5cff',
  eventNeutral: '#8a968f',
  // アクセント地（緑バナー）上に常時乗る白オーバーレイ（テーマ非依存の装飾値）。
  whiteOverlay25: 'rgba(255,255,255,0.25)',
  whiteSubtle90: 'rgba(255,255,255,0.9)',
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
  danger: '#ff8f85',
  dangerBg: 'rgba(255,143,133,0.14)',
  warn: '#ffb95e',
  warnBg: 'rgba(255,185,94,0.14)',
  info: '#7db3ff',
  infoBg: 'rgba(125,179,255,0.14)',
  success: '#6fd598',
  successBg: 'rgba(111,213,152,0.14)',
  priorityBorder: 'rgba(55,201,155,0.45)',
  // ドメイン色のダーク値（時間割グリッド階調/実施パターン休み/マーカー）。
  gridEmpty: 'rgba(255,255,255,0.04)',
  gridFilled: 'rgba(55,201,155,0.14)',
  gridToday: 'rgba(55,201,155,0.24)',
  gridNow: 'rgba(55,201,155,0.36)',
  patternOffBg: '#4a2a1f',
  patternOffText: '#ff9f73',
  favorite: '#ffb84d',
  flag: '#f2b93a',
  updateDot: '#f0b840',
}
