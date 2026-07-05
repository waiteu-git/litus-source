import type { TimetableCollection } from '../collect/timetableMessage'

export function serializeTimetable(collections: TimetableCollection[]): string {
  return JSON.stringify(collections)
}

/** 保存文字列を検証して復元する。null/壊れJSON/配列でない/要素がslots配列を持たない → null。 */
export function deserializeTimetable(raw: string | null): TimetableCollection[] | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  for (const c of parsed) {
    if (typeof c !== 'object' || c === null) return null
    if (!Array.isArray((c as { slots?: unknown }).slots)) return null
  }
  return parsed as TimetableCollection[]
}
