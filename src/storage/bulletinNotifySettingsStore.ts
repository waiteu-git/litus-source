import { Storage } from './asyncStorage'
import type { BulletinNotifySettings } from '../notifications/bulletinNotify'
import {
  serializeBulletinNotifySettings,
  deserializeBulletinNotifySettings,
} from './bulletinNotifySettingsSerialize'

const KEY = 'info.bulletinNotifySettings.v1'

export async function loadBulletinNotifySettings(): Promise<BulletinNotifySettings> {
  return deserializeBulletinNotifySettings(await Storage.getItem(KEY))
}

export async function saveBulletinNotifySettings(s: BulletinNotifySettings): Promise<void> {
  await Storage.setItem(KEY, serializeBulletinNotifySettings(s))
}
