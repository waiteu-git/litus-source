import { createNavigationContainerRef } from '@react-navigation/native'

/**
 * NavigationContainer外（App層の通知応答ハンドラ）から遷移するための参照。
 * 出席アラーム通知タップ時に「ホーム→出席」を即開くのに使う。cold start でナビが未準備でも、
 * requestOpenAttendance() が pending を立て、onReady 後の flushPending() で確実に遷移する。
 */
export const navigationRef = createNavigationContainerRef()

let pendingAttendance = false

function tryOpen() {
  if (navigationRef.isReady()) {
    pendingAttendance = false
    // ホームタブのスタック内 Attendance へネスト遷移（型なし ref のため any 経由）。
    ;(navigationRef as { navigate: (name: string, params?: object) => void }).navigate('ホーム', {
      screen: 'Attendance',
    })
  }
}

/** 出席画面を即開く（未準備なら onReady まで保留）。 */
export function requestOpenAttendance() {
  pendingAttendance = true
  tryOpen()
}

/** NavigationContainer の onReady から呼ぶ。保留中の出席オープンを消化する。 */
export function flushPendingNavigation() {
  if (pendingAttendance) tryOpen()
}
