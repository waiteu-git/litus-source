export type TimetableStackParamList = {
  TimetableHome: undefined
  Collect: undefined
  CollectCourses: undefined
  UpdateCheck: undefined
  SubjectDetail: { courseCode: string; name: string }
  Syllabus: { url: string; name: string }
  Web: { url: string; title?: string }
  PdfViewer: { url: string; title?: string }
}

export type AssignmentsStackParamList = {
  AssignmentsHome: undefined
  CollectAssignments: undefined
  Web: { url: string; title?: string }
  PdfViewer: { url: string; title?: string }
}

export type InfoStackParamList = {
  InfoHome: undefined
  Link: { url: string; title?: string; isClass?: boolean }
  PdfViewer: { url: string; title?: string }
}
