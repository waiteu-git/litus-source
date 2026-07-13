/**
 * リモートkill switchの判定・パース（純粋・RN非依存）。
 * waiteu.dev配信の status.json（v1: { schemaVersion, disabled[], message, title, versionRules[] }）を
 * 正規化し、機能単位（attendance/bulletin/letus）と全体（all）の停止可否を1箇所で判定する。
 * 大学要請時24h以内停止の技術的前提（層1: 一方向配信・アップロード無し）。
 *
 * versionRules はビルド番号（versionCode）で対象を絞る追加停止。修正版を出したあと
 * 「アップデート前のバージョンだけ止める」運用に使う（例: maxBuild:77 で build77以前のみ停止）。
 * このフィールドを解釈するのは build78 以降。それ以前のクライアントは未知フィールドとして
 * 無視するため、build77以前を止める手段はトップレベル disabled のみ。
 * 設計: docs/2026-07-12-remote-kill-switch-design.md
 */

export type KillSwitchFeature = 'attendance' | 'bulletin' | 'letus'

export type KillSwitchStatus = {
  disabledAll: boolean
  disabled: KillSwitchFeature[]
  /** 停止画面/バナーに出す本文。null＝アプリ内既定文言。停止時に status.json で差し替え可。 */
  message: string | null
  /** 全体停止画面の見出し。null＝既定「リタスは一時停止中です」。停止時に status.json で差し替え可。 */
  title: string | null
}

// 復帰のたびに取得しない（スロットル）。停止指示の伝播は起動時＋この間隔で十分（24h要件）。
export const KILL_SWITCH_REFRESH_INTERVAL_MS = 15 * 60 * 1000

const FEATURES: readonly KillSwitchFeature[] = ['attendance', 'bulletin', 'letus']

/**
 * expo-constants の nativeBuildVersion（Androidでは versionCode の文字列）をビルド番号へ正規化する。
 * 取れない環境（Expo Go・dev）や非数値は null＝versionRules の対象外（fail-open）。
 */
export function parseBuildNumber(raw: string | number | null | undefined): number | null {
  if (raw == null) return null
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
  return Number.isInteger(n) && n > 0 ? n : null
}

const normText = (x: unknown): string | null => (typeof x === 'string' && x !== '' ? x : null)

/**
 * status.json本文を、自ビルド番号へ解決済みの状態に正規化する。無効（壊れJSON・HTML誤配信・
 * disabledが配列でない等）は null＝「取得失敗」と同じ扱いにし、呼び出し側が直近キャッシュ維持/
 * fail-openを選ぶ。未知の機能名・schemaVersion・壊れたルールは無視する（前方互換）。
 *
 * versionRules: [{ disabled[], minBuild?, maxBuild?, message?, title? }]（境界は両端含む）。
 * 自ビルドに当たったルールの disabled を合算し、message/title があれば全体の文言を上書きする
 * （複数当たった場合は後勝ち）。build が null（dev等）のときはルールを適用しない。
 */
export function parseKillSwitchStatus(raw: string, build: number | null): KillSwitchStatus | null {
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const disabledRaw = (v as Record<string, unknown>).disabled
  if (!Array.isArray(disabledRaw)) return null
  let disabledAll = disabledRaw.includes('all')
  const disabledSet = new Set(FEATURES.filter((f) => disabledRaw.includes(f)))
  let message = normText((v as Record<string, unknown>).message)
  let title = normText((v as Record<string, unknown>).title)

  const rulesRaw = (v as Record<string, unknown>).versionRules
  if (Array.isArray(rulesRaw) && build != null) {
    for (const r of rulesRaw) {
      if (typeof r !== 'object' || r === null || Array.isArray(r)) continue
      const rule = r as Record<string, unknown>
      if (!Array.isArray(rule.disabled)) continue
      // 境界の型が壊れているルールは「当たらない」側に倒す（誤って全ビルド停止にしない）。
      if (rule.minBuild !== undefined && !(typeof rule.minBuild === 'number' && build >= rule.minBuild)) continue
      if (rule.maxBuild !== undefined && !(typeof rule.maxBuild === 'number' && build <= rule.maxBuild)) continue
      if (rule.disabled.includes('all')) disabledAll = true
      for (const f of FEATURES) if (rule.disabled.includes(f)) disabledSet.add(f)
      message = normText(rule.message) ?? message
      title = normText(rule.title) ?? title
    }
  }

  return {
    disabledAll,
    disabled: FEATURES.filter((f) => disabledSet.has(f)),
    message,
    title,
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
