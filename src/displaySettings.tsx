import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { loadDisplaySettings, saveDisplaySettings } from './storage/displaySettingsStore'
import {
  DEFAULT_DISPLAY_SETTINGS,
  type AssignmentsView,
  type DisplaySettings,
  type ExamCountdownStartSetting,
  type TimetableView,
} from './storage/displaySettingsSerialize'
import type { HomeSectionPref } from './home/homeSections'
import type { SubjectSectionPref } from './subject/subjectSections'

type Ctx = {
  timetableView: TimetableView
  assignmentsView: AssignmentsView
  homeLayout: HomeSectionPref[]
  subjectLayout: SubjectSectionPref[]
  examCountdownStart: ExamCountdownStartSetting
  setTimetableView: (v: TimetableView) => void
  setAssignmentsView: (v: AssignmentsView) => void
  setHomeLayout: (v: HomeSectionPref[]) => void
  setSubjectLayout: (v: SubjectSectionPref[]) => void
  setExamCountdownStart: (v: ExamCountdownStartSetting) => void
}

const DisplaySettingsContext = createContext<Ctx>({
  ...DEFAULT_DISPLAY_SETTINGS,
  setTimetableView: () => {},
  setAssignmentsView: () => {},
  setHomeLayout: () => {},
  setSubjectLayout: () => {},
  setExamCountdownStart: () => {},
})

/**
 * 表示形式（時間割: リスト/グリッド、課題: バケット別/締切順、ホーム・科目詳細の並び、試験カウントダウンの表示開始）を
 * アプリ全体で共有・永続化する。theme.tsx の ThemeProvider と同じ形。設定タブでの切替が即、各画面に反映される。
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
        homeLayout: settings.homeLayout,
        subjectLayout: settings.subjectLayout,
        examCountdownStart: settings.examCountdownStart,
        setTimetableView: (v) => persist({ ...settings, timetableView: v }),
        setAssignmentsView: (v) => persist({ ...settings, assignmentsView: v }),
        setHomeLayout: (v) => persist({ ...settings, homeLayout: v }),
        setSubjectLayout: (v) => persist({ ...settings, subjectLayout: v }),
        setExamCountdownStart: (v) => persist({ ...settings, examCountdownStart: v }),
      }}
    >
      {children}
    </DisplaySettingsContext.Provider>
  )
}

export function useDisplaySettings(): Ctx {
  return useContext(DisplaySettingsContext)
}
