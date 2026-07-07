import AsyncStorage from '@react-native-async-storage/async-storage'
import { deserializeTheme, serializeTheme, type ThemeVariant } from './themeSerialize'

const KEY = 'theme.variant.v1'

export async function saveTheme(v: ThemeVariant): Promise<void> {
  await AsyncStorage.setItem(KEY, serializeTheme(v))
}

export async function loadTheme(): Promise<ThemeVariant> {
  const raw = await AsyncStorage.getItem(KEY)
  return deserializeTheme(raw)
}
