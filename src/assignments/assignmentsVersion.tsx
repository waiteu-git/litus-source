import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

/**
 * 課題ストレージの更新通知。バックグラウンド収集や収集画面が保存後に bump し、
 * 課題一覧が開きっぱなしでも自動で再読込される（フォーカス時再読込の補完）。
 */
const Ctx = createContext<{ version: number; bump: () => void }>({ version: 0, bump: () => {} })

export function AssignmentsVersionProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0)
  const bump = useCallback(() => setVersion((v) => v + 1), [])
  const value = useMemo(() => ({ version, bump }), [version, bump])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAssignmentsVersion() {
  return useContext(Ctx)
}
