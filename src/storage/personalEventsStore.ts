import { Storage } from './asyncStorage'
import type { PersonalEvent } from '../timetableEvents/personalEvent'
import { deserializePersonalEvents, serializePersonalEvents } from './personalEventsSerialize'

const KEY = 'litus.personalEvents.v1'

export async function loadPersonalEvents(): Promise<PersonalEvent[]> {
  return deserializePersonalEvents(await Storage.getItem(KEY))
}
export async function savePersonalEvents(events: PersonalEvent[]): Promise<void> {
  await Storage.setItem(KEY, serializePersonalEvents(events))
}
export async function upsertPersonalEvent(event: PersonalEvent): Promise<PersonalEvent[]> {
  const cur = await loadPersonalEvents()
  const next = [...cur.filter((e) => e.id !== event.id), event]
  await savePersonalEvents(next)
  return next
}
export async function removePersonalEvent(id: string): Promise<PersonalEvent[]> {
  const next = (await loadPersonalEvents()).filter((e) => e.id !== id)
  await savePersonalEvents(next)
  return next
}
