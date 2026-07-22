/**
 * 通知タップの着地先（純関数 routeForNotification の結果）を navigationRef の request* へ配線する。
 * ウィジェットのディープリンク（widget/widgetLinking.ts）と同じ形。
 * navigationRef 未準備でも request* は pending を立て、onReady 後に消化される。
 */
import type { NotificationRoute } from '../notifications/notificationRoute'
import {
  requestOpenAttendance,
  requestOpenBulletins,
  requestOpenLetusCourses,
  requestOpenTimetable,
  requestOpenAssignment,
  requestOpenAssignmentsList,
} from './navigationRef'

export function dispatchNotificationRoute(route: NotificationRoute | null): void {
  if (!route) return
  switch (route.kind) {
    case 'attendance':
      requestOpenAttendance()
      break
    case 'bulletins':
      requestOpenBulletins()
      break
    case 'letusCourses':
      requestOpenLetusCourses()
      break
    case 'timetable':
      requestOpenTimetable()
      break
    case 'assignmentDetail':
      requestOpenAssignment(route.url)
      break
    case 'assignmentsList':
      requestOpenAssignmentsList()
      break
  }
}
