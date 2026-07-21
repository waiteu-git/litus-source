import { Storage } from './asyncStorage'
import {
  deserializeThemeSettings,
  serializeThemeSettings,
  type ThemeSettings,
} from './themeSerialize'

// キーは据置（deserializeThemeSettings が旧形式=素の文字列 と 新形式=JSON の両方を読む）。
const KEY = 'theme.variant.v1'

export async function saveTheme(s: ThemeSettings): Promise<void> {
  await Storage.setItem(KEY, serializeThemeSettings(s))
}

export async function loadTheme(): Promise<ThemeSettings> {
  return deserializeThemeSettings(await Storage.getItem(KEY))
}
