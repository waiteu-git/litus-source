/** ウィジェット名（app.json の widgets 定義・タスクハンドラ・更新要求で共有する唯一の定義）。 */
export const WIDGET_MAIN = 'LitusToday'
export const WIDGET_COMPACT = 'LitusNext'
export const WIDGET_NAMES = [WIDGET_MAIN, WIDGET_COMPACT] as const

/** ウィジェット配色（翠テーマの抜粋。theme.tsx を import すると RN の ThemeProvider 連鎖を引くため独立トークンにする）。 */
export const WIDGET_COLORS = {
  bgTop: '#0d7256',
  bgBottom: '#0b5e4a',
  card: '#ffffff',
  cardInk: '#12332a',
  cardSub: '#4a6b60',
  accent: '#0f9e75',
  onDark: '#ffffff',
  onDarkDim: '#bfe0d4',
  remoteBadgeBg: '#18b892',
  danger: '#e0533a',
  dangerBg: '#fdecea',
  attendBg: '#0aa579',
} as const
