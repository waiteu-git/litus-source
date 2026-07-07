/** 非表示WebViewの現在ページ種別を判定し、エンジンの次の一手を決める（純粋）。 */
export interface ClassPageSignal {
  hasPasswordInput: boolean
  hasAttendanceForm: boolean
  hasEnterSplash: boolean
  hasClassMenu: boolean
  url?: string
}

export type ClassPageKind = 'attendance' | 'login' | 'portal' | 'other'

export function classifyClassPage(s: ClassPageSignal): ClassPageKind {
  if (s.hasPasswordInput) return 'login'
  if (s.hasAttendanceForm) return 'attendance'
  if (s.hasEnterSplash || s.hasClassMenu) return 'portal'
  return 'other'
}
