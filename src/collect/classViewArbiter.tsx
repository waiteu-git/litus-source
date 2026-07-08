import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

/**
 * CLASS(JSF)は同一セッションの複数画面操作を禁止するため、CLASSに触るWebViewを調停する。
 * 出席タブのWebViewは持続させ、時間割収集や掲示など他のCLASS利用者が来たときだけ譲る。
 *
 * 「譲る」(true化)は即時。「戻す」(false化)は RELEASE_DELAY_MS の遊びを入れてから反映する:
 * 他画面のクローズアニメ完了前に出席がCLASSへ触れると競合しうるため、少し待ってから再取得させる。
 * その待機中に再びtrueが来たら（画面往復）保留をキャンセルし、出席の作り直しを無駄に起こさない。
 */
const RELEASE_DELAY_MS = 600

const Ctx = createContext<{ collectActive: boolean; setCollectActive: (v: boolean) => void }>({
  collectActive: false,
  setCollectActive: () => {},
})

export function ClassViewProvider({ children }: { children: ReactNode }) {
  const [collectActive, setCollectActive] = useState(false)
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const request = useCallback((v: boolean) => {
    if (releaseTimer.current) {
      clearTimeout(releaseTimer.current)
      releaseTimer.current = null
    }
    if (v) {
      setCollectActive(true) // 譲るのは即時
    } else {
      releaseTimer.current = setTimeout(() => {
        releaseTimer.current = null
        setCollectActive(false) // 戻すのは遊びを入れてから
      }, RELEASE_DELAY_MS)
    }
  }, [])

  useEffect(() => () => { if (releaseTimer.current) clearTimeout(releaseTimer.current) }, [])

  const value = useMemo(() => ({ collectActive, setCollectActive: request }), [collectActive, request])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useClassView() {
  return useContext(Ctx)
}
