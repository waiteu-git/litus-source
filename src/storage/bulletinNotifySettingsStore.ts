import AsyncStorage from '@react-native-async-storage/async-storage'
import type { BulletinNotifySettings } from '../notifications/bulletinNotify'
import {
  serializeBulletinNotifySettings,
  deserializeBulletinNotifySettings,
} from './bulletinNotifySettingsSerialize'

const KEY = 'info.bulletinNotifySettings.v1'

export async function loadBulletinNotifySettings(): Promise<BulletinNotifySettings> {
  return deserializeBulletinNotifySettings(await AsyncStorage.getItem(KEY))
}

export async function saveBulletinNotifySettings(s: BulletinNotifySettings): Promise<void> {
  await AsyncStorage.setItem(KEY, serializeBulletinNotifySettings(s))
}
