import type { DayOfWeek } from '../parsers/timetable'

export type TimetableStackParamList = {
  TimetableHome: undefined
  Collect: undefined
  CollectCourses: undefined
  UpdateCheck: undefined
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
  // 各回イベント（休講/補講等）の追加/編集。editId ありで既存を編集。
  ClassEventForm: { courseName: string; courseCode: string | null; dayKey?: DayOfWeek; editId?: string }
  Syllabus: { url: string; name: string }
  Web: { url: string; title?: string }
  PdfViewer: { url: string; title?: string }
}

export type AssignmentsStackParamList = {
  AssignmentsHome: undefined
  CollectAssignments: undefined
  LetusAssignmentDetail: { url: string }
  // url なし=新規手動追加 / url あり=その手動課題を編集。
  ManualAssignment: { url?: string } | undefined
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
  Link: { url: string; title?: string; isClass?: boolean }
  PdfViewer: { url: string; title?: string }
  Settings: undefined
}
