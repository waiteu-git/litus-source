import type { ThemePreference, ResolvedVariant } from './storage/themeSerialize'

/** preference と OSカラースキームから表示variantを決める純粋関数。React Native非依存でvitest可能。 */
export function resolveVariant(
  pref: ThemePreference,
  scheme: 'light' | 'dark' | null | undefined,
): ResolvedVariant {
  if (pref === 'system') return scheme === 'dark' ? 'dark' : 'white'
  return pref
}
