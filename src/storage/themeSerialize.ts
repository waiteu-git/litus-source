export type ThemeVariant = 'green' | 'white'

export function serializeTheme(v: ThemeVariant): string {
  return v
}

/** 'green'/旧'glass' のみ green、それ以外（'white'/旧'solid'/null/不正）は既定 white。 */
export function deserializeTheme(raw: string | null): ThemeVariant {
  return raw === 'green' || raw === 'glass' ? 'green' : 'white'
}
