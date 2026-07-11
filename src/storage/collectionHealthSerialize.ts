import type { CollectionHealth } from '../health/collectionHealth'

/** ヘルスを保存する収集の識別子。増やすときはここに追記（未知idはdeserializeで捨てられる）。 */
export type CollectionId = 'bulletin' | 'timetable' | 'letusAssignments'

export type StoredHealth = { health: CollectionHealth; at: number }
export type CollectionHealthMap = Partial<Record<CollectionId, StoredHealth>>

const IDS: readonly CollectionId[] = ['bulletin', 'timetable', 'letusAssignments']
const PLAIN_STATUSES = ['empty_valid', 'structure_drift', 'not_logged_in', 'maintenance', 'blocked'] as const

export function serializeCollectionHealth(m: CollectionHealthMap): string {
  return JSON.stringify(m)
}

/** null/壊れJSON/非オブジェクトは {}。既知idかつ型が正しいエントリのみ採用する。 */
export function deserializeCollectionHealth(raw: string | null): CollectionHealthMap {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  const out: CollectionHealthMap = {}
  for (const id of IDS) {
    const v = (parsed as Record<string, unknown>)[id]
    if (typeof v !== 'object' || v === null) continue
    const { health, at } = v as { health?: unknown; at?: unknown }
    if (typeof at !== 'number' || !Number.isFinite(at)) continue
    const h = validateHealth(health)
    if (!h) continue
    out[id] = { health: h, at }
  }
  return out
}

function validateHealth(health: unknown): CollectionHealth | null {
  if (typeof health !== 'object' || health === null) return null
  const h = health as { status?: unknown; count?: unknown }
  if (h.status === 'ok') {
    if (typeof h.count !== 'number' || !Number.isFinite(h.count)) return null
    return { status: 'ok', count: h.count }
  }
  const s = PLAIN_STATUSES.find((x) => x === h.status)
  return s ? { status: s } : null
}
