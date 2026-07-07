import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { loadTheme, saveTheme } from './storage/themeStore'
import type { ThemeVariant } from './storage/themeSerialize'

export type { ThemeVariant }

/** 翠テーマの共通色トークン。glass/solid で一部の背景・文字色を出し分ける。 */
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

type ThemeCtx = { variant: ThemeVariant; setVariant: (v: ThemeVariant) => void }

const ThemeContext = createContext<ThemeCtx>({ variant: 'glass', setVariant: () => {} })

/**
 * テーマ選択（glass/solid）をアプリ全体で共有・永続化する。全画面が同じContextを読むため、
 * 設定での切替が出席画面など他画面にも即反映される。初回は AsyncStorage から復元。
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [variant, setVariantState] = useState<ThemeVariant>('glass')
  useEffect(() => {
    loadTheme()
      .then(setVariantState)
      .catch(() => undefined)
  }, [])
  function setVariant(v: ThemeVariant) {
    setVariantState(v)
    saveTheme(v).catch(() => undefined)
  }
  return <ThemeContext.Provider value={{ variant, setVariant }}>{children}</ThemeContext.Provider>
}

export function useThemeVariant(): ThemeCtx {
  return useContext(ThemeContext)
}
