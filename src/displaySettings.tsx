import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { loadDisplaySettings, saveDisplaySettings } from './storage/displaySettingsStore'
import {
  DEFAULT_DISPLAY_SETTINGS,
  type AssignmentsView,
  type DisplaySettings,
  type TimetableView,
} from './storage/displaySettingsSerialize'

type Ctx = {
  timetableView: TimetableView
  assignmentsView: AssignmentsView
  setTimetableView: (v: TimetableView) => void
  setAssignmentsView: (v: AssignmentsView) => void
}

const DisplaySettingsContext = createContext<Ctx>({
  ...DEFAULT_DISPLAY_SETTINGS,
  setTimetableView: () => {},
  setAssignmentsView: () => {},
})

/**
 * 表示形式（時間割: リスト/グリッド、課題: バケット別/締切順）をアプリ全体で共有・永続化する。
 * theme.tsx の ThemeProvider と同じ形。設定タブでの切替が即、時間割/課題タブに反映される。
 */
export function DisplaySettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<DisplaySettings>(DEFAULT_DISPLAY_SETTINGS)

  useEffect(() => {
    loadDisplaySettings()
      .then(setSettings)
      .catch(() => undefined)
  }, [])

  function persist(next: DisplaySettings) {
    setSettings(next)
    saveDisplaySettings(next).catch(() => undefined)
  }

  return (
    <DisplaySettingsContext.Provider
      value={{
        timetableView: settings.timetableView,
        assignmentsView: settings.assignmentsView,
        setTimetableView: (v) => persist({ ...settings, timetableView: v }),
        setAssignmentsView: (v) => persist({ ...settings, assignmentsView: v }),
      }}
    >
      {children}
    </DisplaySettingsContext.Provider>
  )
}

export function useDisplaySettings(): Ctx {
  return useContext(DisplaySettingsContext)
}
