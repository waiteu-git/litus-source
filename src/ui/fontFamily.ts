/**
 * アプリ共通フォント（IBM Plex Sans JP）の fontWeight → fontFamily 変換。
 * RN はカスタムフォントで fontWeight によるウェイト切替ができないため、
 * flatten 済み style の fontWeight を対応する family 名へ写像する。
 * APKサイズ抑制のため 400/500/700 の3ウェイトのみバンドルし、600/800/900/bold は 700 に寄せる。
 * React Native 非依存の純粋ロジック（vitest対象）。
 */

/** useFonts に渡すキー名と一致させる（@expo-google-fonts の命名）。 */
export const FONT = {
  regular: 'IBMPlexSansJP_400Regular',
  medium: 'IBMPlexSansJP_500Medium',
  bold: 'IBMPlexSansJP_700Bold',
} as const

/** fontWeight 値（'600' / 700 / 'bold' / 'normal' / undefined）を family 名へ写像する。 */
export function fontFamilyForWeight(weight?: string | number): string {
  if (weight == null || weight === 'normal') return FONT.regular
  if (weight === 'bold') return FONT.bold
  const n = typeof weight === 'number' ? weight : Number.parseInt(weight, 10)
  if (Number.isNaN(n)) return FONT.regular
  if (n >= 600) return FONT.bold
  if (n >= 500) return FONT.medium
  return FONT.regular
}

type WeightProps = { fontFamily?: string; fontWeight?: string | number }

/**
 * flatten 済み style に fontFamily を付与し fontWeight を除去した新オブジェクトを返す。
 * 明示的に fontFamily が指定されている場合（等幅など）はそのまま返し、意図を尊重する。
 */
export function toPlexStyle<T extends object>(
  style?: T | null,
): T & { fontFamily?: string; fontWeight?: undefined } {
  const flat = (style ?? {}) as T & WeightProps
  if (flat.fontFamily != null) return flat as T & { fontFamily: string; fontWeight?: undefined }
  return { ...flat, fontFamily: fontFamilyForWeight(flat.fontWeight), fontWeight: undefined }
}
