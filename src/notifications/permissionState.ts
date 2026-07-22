/**
 * 通知権限の状態から「次に何をすべきか」を決める純粋関数（RN非依存）。
 *
 * 判定則はネイティブ実装から導出している。**status だけでも granted だけでも必ず外す**:
 * - NotificationPermissionsModule.kt の status は
 *   areAllDenied → denied / !areNotificationsEnabled() → denied / areAllGranted → granted / else undetermined の順。
 *   Android 13+ の新規インストールは POST_NOTIFICATIONS 未付与＝areNotificationsEnabled() が false なので、
 *   **一度も聞いていなくても status='denied'（canAskAgain=true）** になる。
 *   → status で「未要求」を見分けると初回要求ごと死ぬ。
 * - 逆に権限は付与済みだがOS設定でアプリの通知を全OFFにすると **granted=true のまま status='denied'**。
 *   この状態で再要求してもダイアログは出ない（既に付与済み）ので設定アプリへ送るしかない。
 *
 * **canAskAgain は Activity が前面にある時しか信用できない**（PermissionsService.kt は
 * currentActivity が null なら false を返す）。起動直後や背面で取得すると「恒久拒否」と
 * 誤判定し、まだ聞けるユーザーを設定アプリへ送ってしまう。必ず画面表示時／前面確定後に取得すること。
 */

export type NotifPermission = {
  status: 'granted' | 'denied' | 'undetermined'
  granted: boolean
  canAskAgain: boolean
}

export type NotifPermissionAction = 'none' | 'request' | 'openSettings'

export function notificationPermissionAction(
  p: NotifPermission | null | undefined,
): NotifPermissionAction {
  // 取得できない＝Expo Go かモジュール不在。回復導線を出しても押せる先が無い。
  if (!p) return 'none'
  if (p.status === 'granted') return 'none'
  // 未要求（undetermined）と1回拒否（denied/canAskAgain=true）はどちらもここ。
  if (!p.granted && p.canAskAgain) return 'request'
  // 2回拒否（canAskAgain=false・Android はインストール単位で恒久）と、
  // 権限はあるがOS設定で通知OFF（granted=true）。どちらもアプリからは要求できない。
  return 'openSettings'
}

/** 回復導線の文言（設定画面の行とホームのバナーで共有）。none は描画しない。 */
export function notificationPermissionNotice(
  action: NotifPermissionAction,
): { body: string; cta: string } | null {
  switch (action) {
    case 'request':
      return {
        body: '通知が許可されていません。締切と出席のお知らせが届きません。',
        cta: '通知を許可',
      }
    case 'openSettings':
      return {
        body: '端末の設定で通知がオフになっています。締切と出席のお知らせが届きません。',
        cta: '端末の設定を開く',
      }
    default:
      return null
  }
}
