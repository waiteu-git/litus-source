/**
 * CLASS / LETUS への「今アクセスしてよいか」を1箇所で判定する（純粋・RN非依存）。
 * メンテナンス帯（時刻）とオフライン（接続なし）を統合し、優先度は offline > maintenance。
 * オフライン検知は connectivity.ts が解決し、isOnline として渡す（純粋層はNetInfoを知らない）。
 */
import { maintenanceSystemAt, type MaintenanceSystem } from './maintenanceWindow'

export type AccessReason = 'ok' | 'maintenance' | 'offline'
export type AccessDecision = { allowed: boolean; reason: AccessReason }

export function evaluateAccess(
  system: MaintenanceSystem,
  opts: { now: Date; isOnline: boolean },
): AccessDecision {
  if (!opts.isOnline) return { allowed: false, reason: 'offline' }
  if (maintenanceSystemAt(opts.now) === system) return { allowed: false, reason: 'maintenance' }
  return { allowed: true, reason: 'ok' }
}
