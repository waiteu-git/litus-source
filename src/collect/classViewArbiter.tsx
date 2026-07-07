import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

/**
 * CLASS(JSF)は同一セッションの複数画面操作を禁止するため、アプリ内でCLASSに触るWebViewを
 * 調停する。出席タブのWebViewは一度開いたら**持続**させ（タブ切替で破棄しない＝再訪ゼロ秒・
 * 「別の画面で操作された」も出ない）、時間割収集など他のCLASS利用者が来たときだけ譲る。
 */
const Ctx = createContext<{ collectActive: boolean; setCollectActive: (v: boolean) => void }>({
  collectActive: false,
  setCollectActive: () => {},
})

export function ClassViewProvider({ children }: { children: ReactNode }) {
  const [collectActive, setCollectActive] = useState(false)
  const value = useMemo(() => ({ collectActive, setCollectActive }), [collectActive])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useClassView() {
  return useContext(Ctx)
}
