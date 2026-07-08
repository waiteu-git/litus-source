import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  serializeDisplaySettings,
  deserializeDisplaySettings,
  type DisplaySettings,
} from './displaySettingsSerialize'

const KEY = 'display.settings.v1'

export async function saveDisplaySettings(s: DisplaySettings): Promise<void> {
  await AsyncStorage.setItem(KEY, serializeDisplaySettings(s))
}

export async function loadDisplaySettings(): Promise<DisplaySettings> {
  return deserializeDisplaySettings(await AsyncStorage.getItem(KEY))
}
