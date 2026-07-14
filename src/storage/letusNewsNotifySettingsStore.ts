import AsyncStorage from '@react-native-async-storage/async-storage'
import type { LetusNewsNotifySettings } from '../notifications/letusNewsNotify'
import {
  deserializeLetusNewsNotifySettings,
  serializeLetusNewsNotifySettings,
} from './letusNewsNotifySettingsSerialize'

const KEY = 'letus.newsNotifySettings.v1'

export async function loadLetusNewsNotifySettings(): Promise<LetusNewsNotifySettings> {
  return deserializeLetusNewsNotifySettings(await AsyncStorage.getItem(KEY))
}

export async function saveLetusNewsNotifySettings(s: LetusNewsNotifySettings): Promise<void> {
  await AsyncStorage.setItem(KEY, serializeLetusNewsNotifySettings(s))
}
