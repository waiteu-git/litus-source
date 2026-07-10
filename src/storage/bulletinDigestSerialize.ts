import type { BulletinBody } from '../parsers/bulletinDetail'

/** インフォ「CLASS掲示」の保存表現（v2）。未読/フラグ状態と本文キャッシュ(body)を持つ。
 *  body は詳細タップで取得するまで null。v1（id/category/title/meta のみ）も読み込める。 */
export type BulletinItem = {
  id: string
  category: string
  title: string
  date: string
  meta: string
  unread: boolean
  flagged: boolean
  important: boolean
  body: BulletinBody | null
}

export function serializeBulletinDigest(items: BulletinItem[]): string {
  return JSON.stringify(items)
}

function normBody(v: unknown): BulletinBody | null {
  if (typeof v !== 'object' || v === null) return null
  const e = v as Partial<BulletinBody>
  if (typeof e.text !== 'string') return null
  return {
    from: String(e.from ?? ''),
    category: String(e.category ?? ''),
    subject: String(e.subject ?? ''),
    text: e.text,
    period: String(e.period ?? ''),
    hasAttachment: Boolean(e.hasAttachment),
  }
}

export function deserializeBulletinDigest(raw: string | null): BulletinItem[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const out: BulletinItem[] = []
  for (const v of parsed) {
    if (typeof v !== 'object' || v === null) continue
    const e = v as Record<string, unknown>
    if (typeof e.id !== 'string' || typeof e.title !== 'string') continue
    out.push({
      id: e.id,
      category: String(e.category ?? ''),
      title: e.title,
      date: String(e.date ?? ''),
      meta: String(e.meta ?? ''),
      unread: e.unread === undefined ? true : Boolean(e.unread), // 旧v1は未読扱い
      flagged: Boolean(e.flagged),
      important: Boolean(e.important),
      body: normBody(e.body),
    })
  }
  return out
}

/**
 * incoming(最新の状態) を prev にマージする。id一致は状態を上書きしつつ body キャッシュは保持。
 * incoming に含まれない prev の項目は、フラグ付きのものだけ残す（既読フラグ付きの保持）。
 */
export function mergeBulletinItems(prev: BulletinItem[], incoming: BulletinItem[]): BulletinItem[] {
  const byId = new Map(prev.map((i) => [i.id, i]))
  const seen = new Set<string>()
  const out: BulletinItem[] = []
  for (const inc of incoming) {
    const old = byId.get(inc.id)
    out.push({ ...inc, body: inc.body ?? old?.body ?? null })
    seen.add(inc.id)
  }
  for (const old of prev) {
    if (!seen.has(old.id) && old.flagged) out.push(old)
  }
  return out
}

function update(items: BulletinItem[], id: string, patch: (i: BulletinItem) => BulletinItem): BulletinItem[] {
  return items.map((i) => (i.id === id ? patch(i) : i))
}

export function setItemBody(items: BulletinItem[], id: string, body: BulletinBody): BulletinItem[] {
  return update(items, id, (i) => ({ ...i, body }))
}

export function markItemRead(items: BulletinItem[], id: string): BulletinItem[] {
  return update(items, id, (i) => ({ ...i, unread: false }))
}

export function setItemFlag(items: BulletinItem[], id: string, flagged: boolean): BulletinItem[] {
  return update(items, id, (i) => ({ ...i, flagged }))
}
