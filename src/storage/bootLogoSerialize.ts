/** 起動ロゴの背景バリアント。green=翠グラデ（既定・テーマ一致）/ white=白背景。 */
export type BootLogoVariant = 'green' | 'white'

export function serializeBootLogo(v: BootLogoVariant): string {
  return v === 'white' ? 'white' : 'green'
}

/** null/未知値は既定の green。 */
export function deserializeBootLogo(raw: string | null): BootLogoVariant {
  return raw === 'white' ? 'white' : 'green'
}
