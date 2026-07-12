/**
 * LETUS課題の本文キャッシュ（URLキー・オンデマンド取得）。
 * fetchedAt は取得時刻ISOで「HH:mm時点の情報」ラベルとオフライン表示に使う。
 * assignmentsSerialize.ts と同じ検証方針で不正データを安全に落とす。
 */
import type { AssignBody, LetusAttachment } from '../parsers/letusBody'

export type LetusBody = {
  description: string
  attachments: LetusAttachment[]
  fetchedAt: string
}

export type LetusBodyMap = Record<string, LetusBody>

export function serializeLetusBodies(map: LetusBodyMap): string {
  return JSON.stringify(map)
}

function normAttachments(v: unknown): LetusAttachment[] | null {
  if (!Array.isArray(v)) return null
  const out: LetusAttachment[] = []
  for (const a of v) {
    if (typeof a !== 'object' || a === null) return null
    const e = a as Partial<LetusAttachment>
    if (typeof e.name !== 'string' || typeof e.url !== 'string') return null
    out.push({ name: e.name, url: e.url })
  }
  return out
}

/** null/壊れJSON/配列は {}。description・fetchedAt・attachments(各要素name/url文字列)を満たすエントリのみ採用。 */
export function deserializeLetusBodies(raw: string | null): LetusBodyMap {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  const out: LetusBodyMap = {}
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== 'object' || v === null) continue
    const e = v as Partial<LetusBody>
    if (typeof e.description !== 'string') continue
    if (typeof e.fetchedAt !== 'string') continue
    const attachments = normAttachments(e.attachments)
    if (attachments === null) continue
    out[k] = { description: e.description, attachments, fetchedAt: e.fetchedAt }
  }
  return out
}

/** 1件を fetchedAt 付きで差し込んだ新しいマップを返す（純粋・store の mutate から呼ぶ）。 */
export function setBodyEntry(
  map: LetusBodyMap,
  url: string,
  body: AssignBody,
  fetchedAt: string,
): LetusBodyMap {
  return {
    ...map,
    [url]: { description: body.description, attachments: body.attachments, fetchedAt },
  }
}
