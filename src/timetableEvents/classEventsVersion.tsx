import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

/**
 * 各回イベント（休講/補講等）ストレージの更新通知。フォーム保存後に bump し、
 * 時間割・ホーム・詳細が開きっぱなしでも自動で再読込される。
 */
const Ctx = createContext<{ version: number; bump: () => void }>({ version: 0, bump: () => {} })

export function ClassEventsVersionProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0)
  const bump = useCallback(() => setVersion((v) => v + 1), [])
  const value = useMemo(() => ({ version, bump }), [version, bump])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useClassEventsVersion() {
  return useContext(Ctx)
}
