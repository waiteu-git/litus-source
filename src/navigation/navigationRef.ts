import { createNavigationContainerRef } from '@react-navigation/native'

/**
 * NavigationContainer外（App層の通知応答ハンドラ）から遷移するための参照。
 * 出席アラーム→「ホーム→出席」、新着掲示→「ホーム→掲示一覧」を即開くのに使う。
 * cold start でナビ未準備でも pending を立て、onReady 後の flushPendingNavigation で確実に遷移する。
 */
export const navigationRef = createNavigationContainerRef()

let pendingAttendance = false
let pendingBulletin = false

function nav(name: string, params?: object) {
  ;(navigationRef as { navigate: (name: string, params?: object) => void }).navigate(name, params)
}

function tryOpenAttendance() {
  if (navigationRef.isReady()) {
    pendingAttendance = false
    nav('ホーム', { screen: 'Attendance' })
  }
}

function tryOpenBulletin() {
  if (navigationRef.isReady()) {
    pendingBulletin = false
    nav('ホーム', { screen: 'Bulletin' })
  }
}

/** 出席画面を即開く（未準備なら onReady まで保留）。 */
export function requestOpenAttendance() {
  pendingAttendance = true
  tryOpenAttendance()
}

/** 掲示一覧を即開く（未準備なら onReady まで保留）。 */
export function requestOpenBulletins() {
  pendingBulletin = true
  tryOpenBulletin()
}

/** NavigationContainer の onReady から呼ぶ。保留中のオープンを消化する。 */
export function flushPendingNavigation() {
  if (pendingAttendance) tryOpenAttendance()
  if (pendingBulletin) tryOpenBulletin()
}
