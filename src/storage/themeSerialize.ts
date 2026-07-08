export type ThemeVariant = 'green' | 'white'

export function serializeTheme(v: ThemeVariant): string {
  return v
}

/** 'white'/旧'solid' は white、それ以外（'green'/旧'glass'/null/不正）は既定 green。 */
export function deserializeTheme(raw: string | null): ThemeVariant {
  return raw === 'white' || raw === 'solid' ? 'white' : 'green'
}
