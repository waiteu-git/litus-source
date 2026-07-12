import AsyncStorage from '@react-native-async-storage/async-storage'
import type { CampusId } from '../info/infoLinks'
import { deserializeInfoCampus, serializeInfoCampus } from './infoCampusSerialize'

const KEY = 'info.campus.v1'

export async function saveInfoCampus(v: CampusId | null): Promise<void> {
  await AsyncStorage.setItem(KEY, serializeInfoCampus(v))
}

export async function loadInfoCampus(): Promise<CampusId | null> {
  const raw = await AsyncStorage.getItem(KEY)
  return deserializeInfoCampus(raw)
}
