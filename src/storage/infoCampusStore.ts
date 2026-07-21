import { Storage } from './asyncStorage'
import type { CampusId } from '../info/infoLinks'
import { deserializeInfoCampus, serializeInfoCampus } from './infoCampusSerialize'

const KEY = 'info.campus.v1'

export async function saveInfoCampus(v: CampusId | null): Promise<void> {
  await Storage.setItem(KEY, serializeInfoCampus(v))
}

export async function loadInfoCampus(): Promise<CampusId | null> {
  const raw = await Storage.getItem(KEY)
  return deserializeInfoCampus(raw)
}
