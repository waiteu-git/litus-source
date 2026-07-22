/**
 * 下部に自前のボタンを持つ全画面ビューア。浮遊タブバー（bottom:0/height:70/elevation:8）と
 * 出席FABがこれらの画面のボタンを覆ってタップを奪うため、両方を隠す対象として一箇所で持つ。
 * RootTabs と AttendanceFab に同じ配列を二重定義していたのが片方だけ更新漏れする原因だった。
 *
 * 'Link' は HomeStack に登録済みだが現在どこからも navigate されていない（到達経路なし）。
 * LinkViewer を再配線した時に同じ被りを再発させないため、集合には残す。
 */
export const FULLSCREEN_VIEWER_ROUTES = ['Web', 'PdfViewer', 'Link', 'BulletinWeb'] as const

/** タブバーを隠すルート名。 */
export const HIDE_TAB_BAR_ROUTES: ReadonlySet<string> = new Set(FULLSCREEN_VIEWER_ROUTES)

/** 出席FABを出さないルート名（上記＋ホーム=独自バナーを持つ／出席画面=遷移先自身）。 */
export const HIDE_ATTENDANCE_FAB_ROUTES: ReadonlySet<string> = new Set<string>([
  ...FULLSCREEN_VIEWER_ROUTES,
  'HomeHome',
  'Attendance',
])
