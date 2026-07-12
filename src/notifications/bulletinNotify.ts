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
  if (items.length === 0) return { title: '新着掲示', body: '' }
  if (items.length === 1) return { title: '新着掲示', body: items[0].title }
  return { title: `新着掲示 ${items.length}件`, body: `${items[0].title} 他` }
}

/** 通知済みidの上限。CLASS掲示の1学期規模を十分カバーしつつ無制限成長を防ぐ。 */
export const NOTIFIED_IDS_CAP = 500

/**
 * 通知済みidを後勝ちで重複除去（最新の出現位置を残す）し、直近 max 件に丸める。
 * live集合との交差はしない——一時的に収集から消えた掲示の再流入時も再通知を防ぐため、
 * 現存しないidも上限まで記憶し続ける。
 */
export function capNotifiedIds(ids: string[], max: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (let i = ids.length - 1; i >= 0; i--) {
    const id = ids[i]
    if (!seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  out.reverse() // 古い→新しい順に戻す
  return out.length > max ? out.slice(out.length - max) : out
}
