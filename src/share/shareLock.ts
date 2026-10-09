/**
 * 共有シートの二重タップを時刻で切るロック（純粋）。設計: docs/design/2026-10-09-G-share-to-friends.md §5
 *
 * LinkRow には無効化の props が無く、Android の Share.share はチューザ表示直後に解決する（表示中も押せる）ため、
 * promise の解決を待つロックは使えない。時計が戻った場合は開ける（永久ロックにしない）。
 */
export const SHARE_LOCK_MS = 1000

export function canOpenShare(now: number, lastOpenedAt: number | null, lockMs: number = SHARE_LOCK_MS): boolean {
  if (lastOpenedAt === null) return true
  if (now < lastOpenedAt) return true
  return now - lastOpenedAt >= lockMs
}
