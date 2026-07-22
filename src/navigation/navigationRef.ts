import { createNavigationContainerRef } from '@react-navigation/native'

/**
 * NavigationContainer外（App層の通知応答ハンドラ）から遷移するための参照。
 * 出席アラーム→「ホーム→出席」、新着掲示→「ホーム→掲示一覧」を即開くのに使う。
 * cold start でナビ未準備でも pending を立て、onReady 後の flushPendingNavigation で確実に遷移する。
 */
export const navigationRef = createNavigationContainerRef()

let pendingAttendance = false
let pendingBulletin = false
let pendingTimetable = false
let pendingLetusCourses = false
let pendingAssignmentsList = false
/** 保留中に開くべき課題URL（null=なし）。 */
let pendingAssignmentUrl: string | null = null

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

function tryOpenTimetable() {
  if (navigationRef.isReady()) {
    pendingTimetable = false
    nav('時間割', { screen: 'TimetableHome' })
  }
}

function tryOpenAssignment() {
  if (pendingAssignmentUrl && navigationRef.isReady()) {
    const url = pendingAssignmentUrl
    pendingAssignmentUrl = null
    nav('課題', { screen: 'LetusAssignmentDetail', params: { url } })
  }
}

function tryOpenAssignmentsList() {
  if (navigationRef.isReady()) {
    pendingAssignmentsList = false
    nav('課題', { screen: 'AssignmentsHome' })
  }
}

function tryOpenLetusCourses() {
  if (navigationRef.isReady()) {
    pendingLetusCourses = false
    nav('時間割', { screen: 'LetusCourses' })
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

/** 時間割タブを即開く（未準備なら onReady まで保留）。ウィジェットの授業カードタップ用。 */
export function requestOpenTimetable() {
  pendingTimetable = true
  tryOpenTimetable()
}

/** 指定URLの課題詳細を即開く（未準備なら onReady まで保留）。ウィジェットの課題タップ用。 */
export function requestOpenAssignment(url: string) {
  pendingAssignmentUrl = url
  tryOpenAssignment()
}

/**
 * 課題一覧を即開く（未準備なら onReady まで保留）。
 * 朝まとめ通知（対象が1件に定まらない）と、旧payload で assignmentId を持たない
 * 課題リマインドのフォールバック着地に使う。
 */
export function requestOpenAssignmentsList() {
  pendingAssignmentsList = true
  tryOpenAssignmentsList()
}

/** LETUSコース一覧を即開く（未準備なら onReady まで保留）。LETUS新着通知タップ用。 */
export function requestOpenLetusCourses() {
  pendingLetusCourses = true
  tryOpenLetusCourses()
}

/** NavigationContainer の onReady から呼ぶ。保留中のオープンを消化する。 */
export function flushPendingNavigation() {
  if (pendingAttendance) tryOpenAttendance()
  if (pendingBulletin) tryOpenBulletin()
  if (pendingTimetable) tryOpenTimetable()
  if (pendingLetusCourses) tryOpenLetusCourses()
  if (pendingAssignmentsList) tryOpenAssignmentsList()
  if (pendingAssignmentUrl) tryOpenAssignment()
}
