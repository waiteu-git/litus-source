import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { loadTheme, saveTheme } from './storage/themeStore'
import {
  DEFAULT_THEME_SETTINGS,
  applyThemePreference,
  themePreferenceOf,
  type ThemePreference,
  type ResolvedVariant,
  type ThemeSettings,
} from './storage/themeSerialize'
import { resolveVariant } from './theme.resolve'
import { COLORS, DARK } from './theme.palette'

export type { ThemePreference, ResolvedVariant, ThemeSettings }
export { resolveVariant }
/** 配色パレットは theme.palette.ts（純粋・RN非依存）に集約。従来の import 経路を維持するため re-export。 */
export { COLORS, DARK }

type ThemeCtx = {
  variant: ResolvedVariant
  preference: ThemePreference
  setPreference: (p: ThemePreference) => void
  ready: boolean
}

const ThemeContext = createContext<ThemeCtx>({
  variant: 'white',
  preference: 'white',
  setPreference: () => {},
  ready: false,
})

/**
 * テーマ選択をアプリ全体で共有・永続化する。'system'（自動）はOSのダークモードに追従し、
 * ライト側は**ユーザーが選んでいたテーマ（翠/白）**へ戻る。
 * ready が true になるまで（AsyncStorage復元前）は変数のみ確定させ、下流は白フラッシュを避けられる。
 *
 * 内部状態は2軸の ThemeSettings。context が公開するのは従来どおり4択の preference/setPreference で、
 * 相互変換は themePreferenceOf / applyThemePreference が担う（消費者=SettingsScreen は変更不要）。
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme()
  const [settings, setSettings] = useState<ThemeSettings>(DEFAULT_THEME_SETTINGS)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    loadTheme()
      .then(setSettings)
      .catch(() => undefined)
      .finally(() => setReady(true))
  }, [])
  function setPreference(p: ThemePreference) {
    // ライト側の選択を保持したままモードだけ変える（ダーク/自動を経由しても翠が消えない）。
    setSettings((s) => {
      const next = applyThemePreference(s, p)
      saveTheme(next).catch(() => undefined)
      return next
    })
  }
  const preference = themePreferenceOf(settings)
  const variant = resolveVariant(settings, scheme === 'dark' || scheme === 'light' ? scheme : undefined)
  return (
    <ThemeContext.Provider value={{ variant, preference, setPreference, ready }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useThemeVariant(): ThemeCtx {
  return useContext(ThemeContext)
}
