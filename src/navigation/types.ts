import type { DayOfWeek } from '../parsers/timetable'
import type { PersonalDayKey } from '../timetableEvents/personalEvent'

export type TimetableStackParamList = {
  TimetableHome: undefined
  Collect: undefined
  CollectCourses: undefined
  LetusCourses: undefined
  SubjectDetail: {
    courseCode: string
    name: string
    // 時間割タップ時のみ渡る付加情報（時限画面から遷移した場合）。他経路からの遷移では undefined。
    day?: string
    dayKey?: DayOfWeek
    period?: number
    room?: string
    teachers?: string[]
    isRemote?: boolean
  }
  // 出欠の詳細（各回記録・総回数調整）と実施パターン編集を統合した低頻度項目の別画面。
  // focus で初期スクロール位置を決める（別画面化・設計 2026-09-13-settings-subject-declutter-design.md）。
  SubjectSchedule: {
    courseCode: string
    name: string
    focus: 'attendance' | 'pattern'
  }
  // 各回イベント（休講/補講等）の追加/編集。editId ありで既存を編集。
  // initial* は掲示候補からの新規追加時のプリフィル（editId 無しのときのみ反映）。
  ClassEventForm: {
    courseName: string
    courseCode: string | null
    dayKey?: DayOfWeek
    editId?: string
    initialType?: 'cancel' | 'makeup' | 'roomChange' | 'quiz' | 'midterm' | 'final' | 'other'
    initialDate?: string
    initialPeriods?: number[]
    initialRoom?: string
    initialMakeup?: { date: string; periods: number[]; room: string | null }
  }
  // 個人予定（毎週繰り返し）の追加/編集。editId ありで既存を編集。day/period は空きセルタップ時のプリフィル。
  PersonalEventForm: { editId?: string; day?: PersonalDayKey; period?: number }
  Syllabus: { url: string; name: string }
  Web: { url: string; title?: string }
  PdfViewer: { url: string; title?: string }
}

export type AssignmentsStackParamList = {
  AssignmentsHome: undefined
  /** LETUS専用コース（時間割未連携）の追跡管理。 */
  TrackedCourses: undefined
  LetusAssignmentDetail: { url: string }
  // url なし=新規手動追加 / url あり=その手動課題を編集。preset* は科目詳細からの新規追加時の初期値。
  ManualAssignment: { url?: string; presetCourseName?: string; presetCourseCode?: string } | undefined
  Web: { url: string; title?: string }
  PdfViewer: { url: string; title?: string }
}

// ホームタブのスタック。出席・インフォ・設定をホーム内へ集約する。
export type HomeStackParamList = {
  HomeHome: undefined
  Attendance: undefined
  Info: undefined
  Bulletin: undefined
  BulletinDetail: { id: string }
  BulletinWeb: { id: string }
  Link: { url: string; title?: string; isClass?: boolean }
  PdfViewer: { url: string; title?: string }
  Settings: undefined
  // 設定「表示」から: ホーム/科目詳細の並べ替えUI（低頻度・別画面化）。
  SectionOrder: { target: 'home' | 'subject' }
  // 設定「ライセンス」から: フォントライセンス全文（低頻度・別画面化）。
  License: undefined
}
