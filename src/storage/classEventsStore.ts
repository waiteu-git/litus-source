import { Storage } from './asyncStorage'
import type { ClassEvent } from '../timetableEvents/classEvent'
import { deserializeClassEvents, serializeClassEvents } from './classEventsSerialize'

const KEY = 'litus.classEvents.v1'

export async function loadClassEvents(): Promise<ClassEvent[]> {
  return deserializeClassEvents(await Storage.getItem(KEY))
}
export async function saveClassEvents(events: ClassEvent[]): Promise<void> {
  await Storage.setItem(KEY, serializeClassEvents(events))
}
export async function upsertClassEvent(event: ClassEvent): Promise<ClassEvent[]> {
  const cur = await loadClassEvents()
  const next = [...cur.filter((e) => e.id !== event.id), event]
  await saveClassEvents(next)
  return next
}
export async function removeClassEvent(id: string): Promise<ClassEvent[]> {
  const next = (await loadClassEvents()).filter((e) => e.id !== id)
  await saveClassEvents(next)
  return next
}
