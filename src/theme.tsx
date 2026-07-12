import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { loadTheme, saveTheme } from './storage/themeStore'
import type { ThemePreference, ResolvedVariant } from './storage/themeSerialize'
import { resolveVariant } from './theme.resolve'
import { COLORS, DARK } from './theme.palette'

export type { ThemePreference, ResolvedVariant }
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
