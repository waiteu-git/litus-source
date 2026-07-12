import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { loadTheme, saveTheme } from './storage/themeStore'
import type { ThemePreference, ResolvedVariant } from './storage/themeSerialize'
import { resolveVariant } from './theme.resolve'

export type { ThemePreference, ResolvedVariant }
export { resolveVariant }

/** 翠テーマの共通色トークン。green/white/dark で一部の背景・文字色を出し分ける。 */
export const COLORS = {
  emerald: '#0f9e75',
  emeraldDark: '#0a6650',
  emeraldDeep: '#0b5e4a',
  cta: '#0aa579',
  white: '#ffffff',
  ink: '#12332a',
  inkOnGlass: '#053a2c',
  labelOnGlass: '#0b5140',
  tint: '#eef5f2',
  gradTop: '#18b892',
  gradBottom: '#0d7256',
  success: '#0b6b2f',
  successBg: '#e6f4ea',
  warn: '#b26a00',
  danger: '#b3261e',
  dangerBg: '#fdecea',
}

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
 * テーマ選択をアプリ全体で共有・永続化する。'system'はOS設定に追従。
 * ready が true になるまで（AsyncStorage復元前）は変数のみ確定させ、下流は白フラッシュを避けられる。
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme()
  const [preference, setPreferenceState] = useState<ThemePreference>('white')
  const [ready, setReady] = useState(false)
  useEffect(() => {
    loadTheme()
      .then(setPreferenceState)
      .catch(() => undefined)
      .finally(() => setReady(true))
  }, [])
  function setPreference(p: ThemePreference) {
    setPreferenceState(p)
    saveTheme(p).catch(() => undefined)
  }
  const variant = resolveVariant(preference, scheme === 'dark' || scheme === 'light' ? scheme : undefined)
  return (
    <ThemeContext.Provider value={{ variant, preference, setPreference, ready }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useThemeVariant(): ThemeCtx {
  return useContext(ThemeContext)
}
