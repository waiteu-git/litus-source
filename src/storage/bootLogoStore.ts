import AsyncStorage from '@react-native-async-storage/async-storage'
import { deserializeBootLogo, serializeBootLogo, type BootLogoVariant } from './bootLogoSerialize'

const KEY = 'boot.logo.variant.v1'

export async function saveBootLogo(v: BootLogoVariant): Promise<void> {
  await AsyncStorage.setItem(KEY, serializeBootLogo(v))
}

export async function loadBootLogo(): Promise<BootLogoVariant> {
  return deserializeBootLogo(await AsyncStorage.getItem(KEY))
}
