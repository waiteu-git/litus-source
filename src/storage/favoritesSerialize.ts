/** 学食お気に入り（id集合）の直列化。null/不正は空配列、重複除去、文字列のみ。 */

export function serializeFavorites(ids: string[]): string {
  return JSON.stringify([...new Set(ids)])
}

export function deserializeFavorites(raw: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return [...new Set(v.filter((x): x is string => typeof x === 'string'))]
  } catch {
    return []
  }
}

/** idがあれば除去・無ければ追加した新配列を返す（純粋）。 */
export function toggleFavorite(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
}
