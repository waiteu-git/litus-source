export type TimetableStackParamList = {
  TimetableHome: undefined
  Collect: undefined
  CollectCourses: undefined
  UpdateCheck: undefined
  SubjectDetail: { courseCode: string; name: string }
  Web: { url: string; title?: string }
}

export type AssignmentsStackParamList = {
  AssignmentsHome: undefined
  CollectAssignments: undefined
  Web: { url: string; title?: string }
}
