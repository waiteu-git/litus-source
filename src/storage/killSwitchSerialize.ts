/**
 * kill switchキャッシュ { status, fetchedAt, build } のserialize。null/壊れ/型不一致は null
 * （=キャッシュ無し・fail-open）。statusのdisabledは既知の機能名だけに正規化して読む
 * （旧アプリが将来の機能名を保存していても安全に読める）。
 *
 * build: statusを解決したときの自ビルド番号。versionRulesはビルド別に効くため、アプリ更新後に
 * 旧ビルドで解決したキャッシュを流用しない（呼び出し側が自ビルドと不一致なら破棄する）。
 * build欄の無い旧形式キャッシュも null（破棄）にする。
 */
import type { KillSwitchFeature, KillSwitchStatus } from '../health/killSwitch'

export type KillSwitchCache = {
  status: KillSwitchStatus
  fetchedAt: number
  build: number | null
}

const FEATURES: readonly KillSwitchFeature[] = ['attendance', 'bulletin', 'letus']

export function serializeKillSwitchCache(cache: KillSwitchCache): string {
  return JSON.stringify(cache)
}

export function deserializeKillSwitchCache(raw: string | null): KillSwitchCache | null {
  if (!raw) return null
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof v !== 'object' || v === null) return null
  const { status, fetchedAt, build } = v as Record<string, unknown>
  if (typeof fetchedAt !== 'number' || !Number.isFinite(fetchedAt)) return null
  if (!(build === null || (typeof build === 'number' && Number.isFinite(build)))) return null
  if (typeof status !== 'object' || status === null) return null
  const s = status as Record<string, unknown>
  if (!Array.isArray(s.disabled)) return null
  return {
    status: {
      disabledAll: s.disabledAll === true,
      disabled: FEATURES.filter((f) => (s.disabled as unknown[]).includes(f)),
      message: typeof s.message === 'string' && s.message !== '' ? s.message : null,
      title: typeof s.title === 'string' && s.title !== '' ? s.title : null,
    },
    fetchedAt,
    build,
  }
}
