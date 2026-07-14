/**
 * LETUS更新通知の設定の直列化（純粋・RN非依存）。未知値/壊れ値は既定に倒す。
 * 掲示通知設定（bulletinNotifySettingsSerialize）と同型。mode区分は無い（活動に重要度が無い）。
 */
import {
  DEFAULT_LETUS_NEWS_NOTIFY_SETTINGS,
  type LetusNewsNotifySettings,
} from '../notifications/letusNewsNotify'

export function serializeLetusNewsNotifySettings(s: LetusNewsNotifySettings): string {
  return JSON.stringify(s)
}

export function deserializeLetusNewsNotifySettings(raw: string | null): LetusNewsNotifySettings {
  if (!raw) return { ...DEFAULT_LETUS_NEWS_NOTIFY_SETTINGS }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ...DEFAULT_LETUS_NEWS_NOTIFY_SETTINGS }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ...DEFAULT_LETUS_NEWS_NOTIFY_SETTINGS }
  }
  const e = parsed as Record<string, unknown>
  const enabled = typeof e.enabled === 'boolean' ? e.enabled : DEFAULT_LETUS_NEWS_NOTIFY_SETTINGS.enabled
  return { enabled }
}
