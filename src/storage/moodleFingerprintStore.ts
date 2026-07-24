/**
 * 受動版フィンガープリント（spec§9・T8）の永続化配線。AsyncStorage 単一キー。
 *
 * ⚠ Storage ファサード（./asyncStorage）経由必須。AsyncStorage を直接 import すると
 * デモ名前空間を迂回してデモ中に実データを壊す（storageFacadeGuard ラチェットが強制）。
 *
 * 保存するのは「版が読めた最新観測1件」だけ。読めなかったスキャンでは既存の記録を消さない
 * （last-good 維持＝一度観測できた版を、フッタのヘルプリンクが無いページを踏んだだけで失わない）。
 * bodyClasses はページ毎に揺れる一時情報なので永続しない（moodleFingerprint.ts の設計）。
 */

import { Storage } from './asyncStorage'
import type { StoredMoodleFingerprint } from '../health/moodleFingerprint'

/** AsyncStorage の保存キー（配線・UI 側が共有する単一情報源）。 */
export const MOODLE_FINGERPRINT_KEY = 'litus.moodleFingerprint'

export function serializeMoodleFingerprint(value: StoredMoodleFingerprint): string {
  return JSON.stringify(value)
}

/** 整数（版セグメント由来）として妥当か。負値・小数・NaN・Infinity を弾く。 */
function isVersionPart(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/**
 * 保存済み観測を復元する。null / 壊れJSON / 型不正は null（＝未観測扱い）。
 * bs5 は保存値をそのまま信じず version から再導出する（保存時と読出時で判定がずれない）。
 */
export function deserializeMoodleFingerprint(raw: string | null): StoredMoodleFingerprint | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const p = parsed as Record<string, unknown>
  if (typeof p.observedAt !== 'string') return null
  const v = p.version
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const version = v as Record<string, unknown>
  if (!isVersionPart(version.major) || !isVersionPart(version.minor)) return null
  return {
    version: { major: version.major, minor: version.minor },
    bs5: version.major >= 5,
    observedAt: p.observedAt,
  }
}

/** 保存済みの最新観測を読む。未観測・破損時は null。 */
export async function loadMoodleFingerprint(): Promise<StoredMoodleFingerprint | null> {
  return deserializeMoodleFingerprint(await Storage.getItem(MOODLE_FINGERPRINT_KEY))
}

/** 最新観測を保存する（1キー上書き）。 */
export async function saveMoodleFingerprint(value: StoredMoodleFingerprint): Promise<void> {
  await Storage.setItem(MOODLE_FINGERPRINT_KEY, serializeMoodleFingerprint(value))
}
