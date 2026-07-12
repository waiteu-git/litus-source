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

// RN の名前付き fontWeight（'medium' / 'semibold' 等）も TextStyle 型として通るため、数値へ正規化する。
const NAMED_WEIGHTS: Record<string, number> = {
  thin: 100,
  ultralight: 200,
  light: 300,
  normal: 400,
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  heavy: 800,
  black: 900,
}

/** fontWeight 値（'600' / 700 / 'bold' / 'medium' / 'normal' / undefined）を family 名へ写像する。 */
export function fontFamilyForWeight(weight?: string | number): string {
  if (weight == null) return FONT.regular
  const n =
    typeof weight === 'number'
      ? weight
      : (NAMED_WEIGHTS[weight] ?? Number.parseInt(weight, 10))
  if (Number.isNaN(n)) return FONT.regular
  if (n >= 600) return FONT.bold
  if (n >= 500) return FONT.medium
  return FONT.regular
}

/**
 * flatten 済み style から fontWeight を除去し、fontFamily を付与した新オブジェクトを返す。
 * fontWeight は常に落とす（RN Android はカスタムフォントで fontWeight を無視するため、残すと型と実挙動が食い違う）。
 * 明示的に fontFamily が指定されている場合（等幅など）はその family を尊重し、weight からの写像はしない。
 */
export function toPlexStyle<T extends object>(
  style?: T | null,
): Omit<T, 'fontWeight'> & { fontFamily: string } {
  const s = (style ?? {}) as T & { fontFamily?: string; fontWeight?: string | number }
  const { fontWeight, ...rest } = s
  return { ...rest, fontFamily: s.fontFamily ?? fontFamilyForWeight(fontWeight) }
}
