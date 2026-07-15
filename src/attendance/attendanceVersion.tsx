import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

/**
 * 出欠統計ストレージ（attendanceStatsStore）の更新通知。時間割同期に相乗りした収集の完了で bump し、
 * 科目詳細が開きっぱなしでも自動で再読込される（[[classEventsVersion]] / [[assignmentsVersion]] と同型）。
 * 収集は数十秒かかるため、同期中に科目詳細を開いて滞在→完了、というケースを取りこぼさない。
 */
const Ctx = createContext<{ version: number; bump: () => void }>({ version: 0, bump: () => {} })

export function AttendanceVersionProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0)
  const bump = useCallback(() => setVersion((v) => v + 1), [])
  const value = useMemo(() => ({ version, bump }), [version, bump])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAttendanceVersion() {
  return useContext(Ctx)
}
