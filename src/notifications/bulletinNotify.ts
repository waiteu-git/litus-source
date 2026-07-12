/**
 * 新着掲示ローカル通知の純粋ロジック（RN非依存・テスト可能）。
 * 差分検知（初回ガード＋通知済み除外＋フィルタ適用）・通知文面・通知済みid剪定を担う。
 * 端末I/O（即時提示/クリア）は notifier.ts、永続化は storage 層が行う。
 * 設計: docs/superpowers/specs/2026-07-12-bulletin-local-notification-design.md
 */
import type { BulletinItem } from '../storage/bulletinDigestSerialize'

export type BulletinNotifySettings = { enabled: boolean; mode: 'all' | 'importantOnly' }

export const DEFAULT_BULLETIN_NOTIFY_SETTINGS: BulletinNotifySettings = { enabled: true, mode: 'all' }

/**
 * 新着＝incoming に居て prev にも notifiedIds にも無いid。
 * prev が空（初回収集/初インストール）は全件が新着に見えるため、常に空を返す（初回ガード）。
 * mode:'importantOnly' は important のみへ絞る。enabled:false は空。
 */
export function diffNewBulletins(
  prev: BulletinItem[],
  incoming: BulletinItem[],
  notifiedIds: string[],
  settings: BulletinNotifySettings,
): BulletinItem[] {
  if (!settings.enabled) return []
  if (prev.length === 0) return []
  const prevIds = new Set(prev.map((i) => i.id))
  const notified = new Set(notifiedIds)
  let fresh = incoming.filter((i) => !prevIds.has(i.id) && !notified.has(i.id))
  if (settings.mode === 'importantOnly') fresh = fresh.filter((i) => i.important)
  return fresh
}

/** 単数は件名を本文に、複数は「新着掲示 N件」＋先頭件名を出す。 */
export function buildBulletinNotificationContent(items: BulletinItem[]): { title: string; body: string } {
  if (items.length === 1) return { title: '新着掲示', body: items[0].title }
  return { title: `新着掲示 ${items.length}件`, body: `${items[0].title} 他` }
}

/** 掲示digestに現存するidだけ残す（消えた掲示のidを落とし、重複も畳む）。 */
export function pruneNotifiedIds(notifiedIds: string[], liveIds: string[]): string[] {
  const live = new Set(liveIds)
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of notifiedIds) {
    if (live.has(id) && !seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  return out
}
