import { Storage } from './asyncStorage'
import {
  serializeDisplaySettings,
  deserializeDisplaySettings,
  type DisplaySettings,
} from './displaySettingsSerialize'

const KEY = 'display.settings.v1'

export async function saveDisplaySettings(s: DisplaySettings): Promise<void> {
  await Storage.setItem(KEY, serializeDisplaySettings(s))
}

export async function loadDisplaySettings(): Promise<DisplaySettings> {
  return deserializeDisplaySettings(await Storage.getItem(KEY))
}
