import { Storage } from './asyncStorage'
import type { TimetableCollection } from '../collect/timetableMessage'
import { serializeTimetable, deserializeTimetable } from './timetableSerialize'

const KEY = 'timetable.collections.v1'

export async function saveTimetable(collections: TimetableCollection[]): Promise<void> {
  await Storage.setItem(KEY, serializeTimetable(collections))
}

export async function loadTimetable(): Promise<TimetableCollection[] | null> {
  const raw = await Storage.getItem(KEY)
  return deserializeTimetable(raw)
}

export async function clearTimetable(): Promise<void> {
  await Storage.removeItem(KEY)
}
