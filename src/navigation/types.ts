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
    period?: number
    room?: string
    teachers?: string[]
    isRemote?: boolean
  }
  Syllabus: { url: string; name: string }
  Web: { url: string; title?: string }
  PdfViewer: { url: string; title?: string }
}

export type AssignmentsStackParamList = {
  AssignmentsHome: undefined
  CollectAssignments: undefined
  LetusAssignmentDetail: { url: string }
  Web: { url: string; title?: string }
  PdfViewer: { url: string; title?: string }
}

export type InfoStackParamList = {
  InfoHome: undefined
  Link: { url: string; title?: string; isClass?: boolean }
  PdfViewer: { url: string; title?: string }
}
