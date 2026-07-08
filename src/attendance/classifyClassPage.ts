import { isSsoLoginUrl } from '../auth/classifyGatePage'

/** 非表示WebViewの現在ページ種別を判定し、エンジンの次の一手を決める（純粋）。 */
export interface ClassPageSignal {
  hasPasswordInput: boolean
  hasAttendanceForm: boolean
  hasEnterSplash: boolean
  hasClassMenu: boolean
  hasSystemError: boolean
  url?: string
}

export type ClassPageKind = 'attendance' | 'login' | 'splash' | 'portal' | 'error' | 'other'

/** モバイル出席登録ページ（Xua00101.xhtml）のURLか。受付中の授業が無いとフォームが無く
 *  hasClassMenu だけ立って portal と誤判定されるため、URLで「出席ページに居る」ことを確定する。 */
export function isAttendanceUrl(url?: string): boolean {
  return /xua001|Xua00101/i.test(url ?? '')
}

export function classifyClassPage(s: ClassPageSignal): ClassPageKind {
  // SSO（Microsoft）ログインの初画面はパスワード欄が無いため、URLでも login を検知する
  if (s.hasPasswordInput || isSsoLoginUrl(s.url)) return 'login'
  // JSF ViewExpired等の「システムエラー」ページ。放置すると操作不能なので検知して自動復帰する
  if (s.hasSystemError) return 'error'
  // 受付フォームがある（＝受付中の授業あり）か、出席ページURLに居るなら attendance。
  // 後者により「受付中の授業なし」の出席ページを portal と誤判定しない。
  if (s.hasAttendanceForm || isAttendanceUrl(s.url)) return 'attendance'
  // 入口スプラッシュはクリックではなくURL直遷移で入場するため portal（メニュー操作）と区別する
  if (s.hasEnterSplash) return 'splash'
  if (s.hasClassMenu) return 'portal'
  return 'other'
}
