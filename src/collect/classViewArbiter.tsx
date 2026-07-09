import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

/**
 * CLASS(JSF)は同一セッションの複数画面操作を禁止するため、CLASSに触るWebViewを調停する。
 *
 * 方針（出席は絶対優先・保護）:
 * - 出席タブが前面(attendanceFocused)のあいだは、収集(時間割/掲示)にCLASSを渡さない。
 * - 収集中に出席タブが開かれたら、即座にCLASSを明け渡す（collectActiveをfalseにし、収集側はabort）。
 * - 「譲る」(collectActive true)は即時。「戻す」(false)は RELEASE_DELAY_MS の遊びを入れてから反映する
 *   （他画面のクローズアニメ完了前に出席がCLASSへ触れて競合するのを防ぐ）。
 */
const RELEASE_DELAY_MS = 600

type Ctx = {
  collectActive: boolean
  attendanceFocused: boolean
  /** 収集側がCLASS使用権を要求/返却する。出席が前面のあいだ true は無視される（出席優先）。 */
  setCollectActive: (v: boolean) => void
  /** 出席タブのフォーカス状態を通知する（出席画面から呼ぶ）。 */
  setAttendanceFocused: (v: boolean) => void
}

const CtxObj = createContext<Ctx>({
  collectActive: false,
  attendanceFocused: false,
  setCollectActive: () => {},
  setAttendanceFocused: () => {},
})

export function ClassViewProvider({ children }: { children: ReactNode }) {
  const [collectActive, setCollectActive] = useState(false)
  const [attendanceFocused, setAttendanceFocusedState] = useState(false)
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attFocusedRef = useRef(false)
  attFocusedRef.current = attendanceFocused

  const clearRelease = () => {
    if (releaseTimer.current) {
      clearTimeout(releaseTimer.current)
      releaseTimer.current = null
    }
  }

  const request = useCallback((v: boolean) => {
    clearRelease()
    if (v) {
      if (attFocusedRef.current) return // 出席が前面ならCLASSを渡さない（絶対優先）
      setCollectActive(true) // 譲るのは即時
    } else {
      releaseTimer.current = setTimeout(() => {
        releaseTimer.current = null
        setCollectActive(false) // 戻すのは遊びを入れてから
      }, RELEASE_DELAY_MS)
    }
  }, [])

  const setAttendanceFocused = useCallback((v: boolean) => {
    setAttendanceFocusedState(v)
    if (v) {
      // 出席が前面に来たら収集を即打ち切ってCLASSを明け渡す（遊びは入れず即時）。
      clearRelease()
      setCollectActive(false)
    }
  }, [])

  useEffect(() => () => clearRelease(), [])

  const value = useMemo<Ctx>(
    () => ({ collectActive, attendanceFocused, setCollectActive: request, setAttendanceFocused }),
    [collectActive, attendanceFocused, request, setAttendanceFocused],
  )
  return <CtxObj.Provider value={value}>{children}</CtxObj.Provider>
}

export function useClassView() {
  return useContext(CtxObj)
}
