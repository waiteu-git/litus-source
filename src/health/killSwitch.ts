/**
 * リモートkill switchの判定・パース（純粋・RN非依存）。
 * waiteu.dev配信の status.json（v1: { schemaVersion, disabled[], message }）を正規化し、
 * 機能単位（attendance/bulletin/letus）と全体（all）の停止可否を1箇所で判定する。
 * 大学要請時24h以内停止の技術的前提（層1: 一方向配信・アップロード無し）。
 * 設計: docs/2026-07-12-remote-kill-switch-design.md
 */

export type KillSwitchFeature = 'attendance' | 'bulletin' | 'letus'

export type KillSwitchStatus = {
  disabledAll: boolean
  disabled: KillSwitchFeature[]
  message: string | null
}

// 復帰のたびに取得しない（スロットル）。停止指示の伝播は起動時＋この間隔で十分（24h要件）。
export const KILL_SWITCH_REFRESH_INTERVAL_MS = 15 * 60 * 1000

const FEATURES: readonly KillSwitchFeature[] = ['attendance', 'bulletin', 'letus']

/**
 * status.json本文を正規化する。無効（壊れJSON・HTML誤配信・disabledが配列でない等）は null
 * ＝「取得失敗」と同じ扱いにし、呼び出し側が直近キャッシュ維持/fail-openを選ぶ。
 * 未知の機能名・schemaVersionは無視する（前方互換: v2以降も disabled/message の意味は追加のみ）。
 */
export function parseKillSwitchStatus(raw: string): KillSwitchStatus | null {
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const disabledRaw = (v as Record<string, unknown>).disabled
  if (!Array.isArray(disabledRaw)) return null
  const messageRaw = (v as Record<string, unknown>).message
  return {
    disabledAll: disabledRaw.includes('all'),
    disabled: FEATURES.filter((f) => disabledRaw.includes(f)),
    message: typeof messageRaw === 'string' && messageRaw !== '' ? messageRaw : null,
  }
}

/** アプリ全体停止か。status未取得（null）は許可（fail-open）。 */
export function isAppKilled(status: KillSwitchStatus | null): boolean {
  return status?.disabledAll ?? false
}

/** 当該機能が停止中か。all は全機能に及ぶ。status未取得（null）は許可（fail-open）。 */
export function isFeatureKilled(status: KillSwitchStatus | null, feature: KillSwitchFeature): boolean {
  if (!status) return false
  return status.disabledAll || status.disabled.includes(feature)
}

/** 前回取得から間隔を過ぎていれば true（=再取得すべき）。未取得（0以下）は常にstale。 */
export function isKillSwitchStale(lastFetchedAt: number, now: number): boolean {
  if (lastFetchedAt <= 0) return true
  return now - lastFetchedAt >= KILL_SWITCH_REFRESH_INTERVAL_MS
}
