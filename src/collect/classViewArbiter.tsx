import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useState } from 'react'

/**
 * CLASS(JSF)は同一セッションの複数画面操作を禁止するため、CLASSに触るWebViewを調停する。
 *
 * 方針（出席は絶対優先・保護）:
 * - 出席タブが前面(attendanceFocused)のあいだは、収集(時間割/掲示)にCLASSを渡さない。
 * - 収集中に出席タブが開かれたら、即座にCLASSを明け渡す（collectActiveをfalseにし、収集側はabort）。
 * - 「譲る」(collectActive true)は即時。「戻す」(false)は RELEASE_DELAY_MS の遊びを入れてから反映する
 *   （他画面のクローズアニメ完了前に出席がCLASSへ触れて競合するのを防ぐ）。
 * - 使用権は**保持トークンの集合**で数える: 掲示同期と時間割更新のような複数の収集が並行しても、
 *   先に終わった側の返却で collectActive が落ちない（旧boolean実装では先着の返却で出席が復帰し、
 *   まだ走っている収集とセッションを奪い合った）。useClassView が呼び出し元ごとのトークンを払い出す
 *   ため、既存の setCollectActive(true/false) の呼び方はそのまま・二重返却も冪等。
 */
const RELEASE_DELAY_MS = 600

type Ctx = {
  collectActive: boolean
  attendanceFocused: boolean
  /** 収集側がCLASS使用権を要求/返却する（トークン単位の保持カウント）。出席が前面のあいだ true は無視される。 */
  setHold: (token: object, v: boolean) => void
  /** 出席タブのフォーカス状態を通知する（出席画面から呼ぶ）。 */
  setAttendanceFocused: (v: boolean) => void
}

const CtxObj = createContext<Ctx>({
  collectActive: false,
  attendanceFocused: false,
  setHold: () => {},
  setAttendanceFocused: () => {},
})

export function ClassViewProvider({ children }: { children: ReactNode }) {
  const [collectActive, setCollectActiveState] = useState(false)
  const [attendanceFocused, setAttendanceFocusedState] = useState(false)
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attFocusedRef = useRef(false)
  attFocusedRef.current = attendanceFocused
  // 使用権を保持中の収集のトークン集合（Set＝取得/返却が冪等）。
  const holdsRef = useRef(new Set<object>())

  const clearRelease = () => {
    if (releaseTimer.current) {
      clearTimeout(releaseTimer.current)
      releaseTimer.current = null
    }
  }

  const setHold = useCallback((token: object, v: boolean) => {
    if (v) {
      if (attFocusedRef.current) return // 出席が前面ならCLASSを渡さない（絶対優先）
      holdsRef.current.add(token)
      clearRelease()
      setCollectActiveState(true) // 譲るのは即時
    } else {
      holdsRef.current.delete(token)
      if (holdsRef.current.size > 0) return // 他の収集がまだ保持中なら返さない
      clearRelease()
      releaseTimer.current = setTimeout(() => {
        releaseTimer.current = null
        if (holdsRef.current.size === 0) setCollectActiveState(false) // 戻すのは遊びを入れてから
      }, RELEASE_DELAY_MS)
    }
  }, [])

  const setAttendanceFocused = useCallback((v: boolean) => {
    setAttendanceFocusedState(v)
    if (v) {
      // 出席が前面に来たら収集を即打ち切ってCLASSを明け渡す（遊びは入れず即時・保持は全解放）。
      holdsRef.current.clear()
      clearRelease()
      setCollectActiveState(false)
    }
  }, [])

  useEffect(() => () => clearRelease(), [])

  const value = useMemo<Ctx>(
    () => ({ collectActive, attendanceFocused, setHold, setAttendanceFocused }),
    [collectActive, attendanceFocused, setHold, setAttendanceFocused],
  )
  return <CtxObj.Provider value={value}>{children}</CtxObj.Provider>
}

/**
 * 消費側フック。setCollectActive は呼び出し元コンポーネントごとのトークンに束ねられ、
 * true/false が何度呼ばれても保持カウントが壊れない（従来のboolean APIと同じ使い勝手）。
 */
export function useClassView(): {
  collectActive: boolean
  attendanceFocused: boolean
  setCollectActive: (v: boolean) => void
  setAttendanceFocused: (v: boolean) => void
} {
  const ctx = useContext(CtxObj)
  const token = useRef<object>({})
  const { setHold } = ctx
  const setCollectActive = useCallback((v: boolean) => setHold(token.current, v), [setHold])
  return {
    collectActive: ctx.collectActive,
    attendanceFocused: ctx.attendanceFocused,
    setCollectActive,
    setAttendanceFocused: ctx.setAttendanceFocused,
  }
}
