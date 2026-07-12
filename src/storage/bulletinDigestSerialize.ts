import type { BulletinBody } from '../parsers/bulletinDetail'
import { parseBulletinEvents, isScheduleCategory } from '../timetableEvents/bulletinEvents'

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

const p2 = (n: number) => String(n).padStart(2, '0')
function todayKey(now: Date): string {
  return `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`
}

/**
 * スケジュール系掲示の保持期限（YYYY-MM-DD）を返す。候補（休講日/補講日）の最遅日付を優先し、
 * 読めなければ掲示期間（body.period）の終了日、それも不可なら null（＝保持しない）。
 */
function retentionEnd(item: BulletinItem): string | null {
  const dates: string[] = []
  for (const c of parseBulletinEvents(item)) {
    dates.push(c.date)
    if (c.makeup) dates.push(c.makeup.date)
  }
  if (dates.length) return dates.sort().at(-1) ?? null
  const period = item.body?.period ?? ''
  const m = period.match(/～\s*(\d{4})\/(\d{1,2})\/(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  return null
}

/**
 * incoming(未読タブ＋フラグつきタブの収集結果＝最新の状態) を権威として prev にマージする。
 * - incoming 内の同一id（未読タブとフラグつきタブに両出する未読かつフラグ付き掲示）は unread/flagged を
 *   OR統合して1件に畳む（重複保存・keyの衝突を防ぐ）。
 * - body キャッシュは prev（または incoming）から引き継ぐ。
 * - incoming に含まれない prev の項目は落とす（既読かつ非フラグ、または収集ウィンドウ外＝CLASS側と一致）。
 * - now を渡すと、スケジュール系（休講/補講/教室変更）で保持期限が未到来の prev は既読でも残す
 *   （当該授業が終わるまで掲示一覧タブ「授業」に残す）。now 省略時は従来どおり落とす（後方互換）。
 */
export function mergeBulletinItems(prev: BulletinItem[], incoming: BulletinItem[], now?: Date): BulletinItem[] {
  const prevById = new Map(prev.map((i) => [i.id, i]))
  const acc = new Map<string, BulletinItem>()
  for (const inc of incoming) {
    const cur = acc.get(inc.id)
    if (cur) {
      acc.set(inc.id, {
        ...cur,
        unread: cur.unread || inc.unread,
        flagged: cur.flagged || inc.flagged,
        body: cur.body ?? inc.body ?? null,
      })
    } else {
      acc.set(inc.id, { ...inc, body: inc.body ?? prevById.get(inc.id)?.body ?? null })
    }
  }
  if (now) {
    const today = todayKey(now)
    for (const p of prev) {
      if (acc.has(p.id)) continue
      if (!isScheduleCategory(p.category)) continue
      const end = retentionEnd(p)
      if (end && end >= today) acc.set(p.id, p)
    }
  }
  return [...acc.values()]
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
