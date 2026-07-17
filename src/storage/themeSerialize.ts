/**
 * テーマ設定の型と直列化（純粋・RN非依存）。
 *
 * **内部表現は「ライトテーマの選択」と「モード」の2軸**（ThemeSettings）。
 * 1軸の文字列（旧 ThemePreference）だと「自動」を選んだ瞬間にライト側の選択（翠/白）が消え、
 * 翠を使っていた人が自動にすると**白へ落ちる**（ユーザー要望 2026-07-17 で判明した不具合）。
 * 2軸に分けることで、自動＝「選んでいたライトテーマ ↔ ダーク」が成立する。
 *
 * 設定UIは従来どおり4択チップ（翠/白/ダーク/自動＝ThemePreference）のまま。
 * themePreferenceOf / applyThemePreference が2軸表現との相互変換を担う。
 */

/** ライト側で選べるテーマ。 */
export type LightTheme = 'green' | 'white'
/** 表示モード。auto はOSのダークモードに追従する。 */
export type ThemeMode = 'light' | 'dark' | 'auto'
/** 永続化・解決に使う内部表現。 */
export type ThemeSettings = { light: LightTheme; mode: ThemeMode }

/** 設定UIの4択チップ。内部表現から導出し、選択で内部表現へ反映する（保存形式ではない）。 */
export type ThemePreference = 'green' | 'white' | 'dark' | 'system'
/** 実際に描画に使うバリアント。 */
export type ResolvedVariant = 'green' | 'white' | 'dark'

export const DEFAULT_THEME_SETTINGS: ThemeSettings = { light: 'white', mode: 'light' }

export function serializeThemeSettings(s: ThemeSettings): string {
  return JSON.stringify(s)
}

/** 旧形式（素の文字列1個）を2軸表現へ移行する。 */
function migrateLegacy(raw: string): ThemeSettings {
  // 旧'glass'→green、旧'solid'→white（既存の移行を踏襲）。
  if (raw === 'green' || raw === 'glass') return { light: 'green', mode: 'light' }
  if (raw === 'dark') return { light: 'white', mode: 'dark' }
  // 旧'system'は「dark or white」だったので、ライト側=白として移行する＝更新しても表示は変わらない。
  // 翠を使いたい人は翠を選び直せば、以後の自動は翠↔ダークになる。
  if (raw === 'system') return { light: 'white', mode: 'auto' }
  return { ...DEFAULT_THEME_SETTINGS }
}

export function deserializeThemeSettings(raw: string | null): ThemeSettings {
  if (!raw) return { ...DEFAULT_THEME_SETTINGS }
  // 新形式はJSON（'{'始まり）。旧形式は素の単語なので判別できる（キーは据置で両対応）。
  if (!raw.startsWith('{')) return migrateLegacy(raw)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ...DEFAULT_THEME_SETTINGS }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ...DEFAULT_THEME_SETTINGS }
  }
  const e = parsed as Record<string, unknown>
  const light: LightTheme = e.light === 'green' ? 'green' : 'white'
  const mode: ThemeMode = e.mode === 'dark' || e.mode === 'auto' ? e.mode : 'light'
  return { light, mode }
}

/** 内部表現 → 設定UIで選択中に見せるチップ。 */
export function themePreferenceOf(s: ThemeSettings): ThemePreference {
  if (s.mode === 'auto') return 'system'
  if (s.mode === 'dark') return 'dark'
  return s.light
}

/**
 * 設定UIのチップ選択 → 内部表現。
 * **ダーク/自動を選んでもライト側の選択（翠/白）は保持する**。これが「自動＝選んでいたライトテーマ↔ダーク」
 * の要。翠→ダーク→自動 と辿っても自動は翠↔ダークになる。
 */
export function applyThemePreference(s: ThemeSettings, p: ThemePreference): ThemeSettings {
  if (p === 'dark') return { ...s, mode: 'dark' }
  if (p === 'system') return { ...s, mode: 'auto' }
  return { light: p, mode: 'light' }
}
