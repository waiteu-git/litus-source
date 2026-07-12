/**
 * 新着掲示通知の設定の直列化（純粋・RN非依存）。
 * 未知値/壊れ値は既定に倒す。未知フィールド・未知modeは無視して将来拡張に寛容にする。
 */
import {
  DEFAULT_BULLETIN_NOTIFY_SETTINGS,
  type BulletinNotifySettings,
} from '../notifications/bulletinNotify'

export function serializeBulletinNotifySettings(s: BulletinNotifySettings): string {
  return JSON.stringify(s)
}

export function deserializeBulletinNotifySettings(raw: string | null): BulletinNotifySettings {
  if (!raw) return { ...DEFAULT_BULLETIN_NOTIFY_SETTINGS }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ...DEFAULT_BULLETIN_NOTIFY_SETTINGS }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ...DEFAULT_BULLETIN_NOTIFY_SETTINGS }
  }
  const e = parsed as Record<string, unknown>
  const enabled = typeof e.enabled === 'boolean' ? e.enabled : DEFAULT_BULLETIN_NOTIFY_SETTINGS.enabled
  const mode = e.mode === 'importantOnly' || e.mode === 'all' ? e.mode : DEFAULT_BULLETIN_NOTIFY_SETTINGS.mode
  return { enabled, mode }
}
