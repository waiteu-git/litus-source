/** インフォタブ「CLASS掲示」の未読ダイジェスト（将来の軽量収集機能向けの保存表現）。
 * 現時点ではこのストアを埋める収集処理は未実装 ―― 空配列なら画面は単一CTAにフォールバックする。
 * 時間割/コースと同じ headless WebView 収集パターンで埋める前提の受け皿として先に用意した。 */
export type BulletinItem = { id: string; category: string; title: string; meta: string }

export function serializeBulletinDigest(items: BulletinItem[]): string {
  return JSON.stringify(items)
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
    const e = v as Partial<BulletinItem>
    if (typeof e.id !== 'string' || typeof e.category !== 'string' || typeof e.title !== 'string' || typeof e.meta !== 'string') continue
    out.push({ id: e.id, category: e.category, title: e.title, meta: e.meta })
  }
  return out
}
