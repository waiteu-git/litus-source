import type { ThemeSettings, ResolvedVariant } from './storage/themeSerialize'

/**
 * テーマ設定とOSカラースキームから表示variantを決める純粋関数。React Native非依存でvitest可能。
 *
 * 自動（mode:'auto'）は **OSがダークならダーク／それ以外はユーザーが選んでいたライトテーマ** に落とす。
 * 旧実装は自動のライト側を 'white' 固定にしていたため、翠を使っていた人が自動にすると白になった。
 */
export function resolveVariant(
  s: ThemeSettings,
  scheme: 'light' | 'dark' | null | undefined,
): ResolvedVariant {
  if (s.mode === 'dark') return 'dark'
  if (s.mode === 'auto') return scheme === 'dark' ? 'dark' : s.light
  return s.light
}
