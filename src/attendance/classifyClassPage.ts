/** 非表示WebViewの現在ページ種別を判定し、エンジンの次の一手を決める（純粋）。 */
export interface ClassPageSignal {
  hasPasswordInput: boolean
  hasAttendanceForm: boolean
  hasEnterSplash: boolean
  hasClassMenu: boolean
  url?: string
}

export type ClassPageKind = 'attendance' | 'login' | 'splash' | 'portal' | 'other'

export function classifyClassPage(s: ClassPageSignal): ClassPageKind {
  if (s.hasPasswordInput) return 'login'
  if (s.hasAttendanceForm) return 'attendance'
  // 入口スプラッシュはクリックではなくURL直遷移で入場するため portal（メニュー操作）と区別する
  if (s.hasEnterSplash) return 'splash'
  if (s.hasClassMenu) return 'portal'
  return 'other'
}
