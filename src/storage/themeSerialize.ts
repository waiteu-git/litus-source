export type ThemePreference = 'green' | 'white' | 'dark' | 'system'
export type ResolvedVariant = 'green' | 'white' | 'dark'

export function serializeTheme(v: ThemePreference): string {
  return v
}

/** 'green'/旧'glass'→green、'dark'/'system'はそのまま、それ以外（'white'/旧'solid'/null/不正）は既定white。 */
export function deserializeTheme(raw: string | null): ThemePreference {
  if (raw === 'green' || raw === 'glass') return 'green'
  if (raw === 'dark' || raw === 'system') return raw
  return 'white'
}
