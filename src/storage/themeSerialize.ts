export type ThemeVariant = 'glass' | 'solid'

export function serializeTheme(v: ThemeVariant): string {
  return v
}

/** 不正値/null は既定の 'glass'。 */
export function deserializeTheme(raw: string | null): ThemeVariant {
  return raw === 'solid' ? 'solid' : 'glass'
}
