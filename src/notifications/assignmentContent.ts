/**
 * 課題通知（締切前リマインダー／朝まとめ）の表示本文を組み立てる純粋関数。
 * attendanceSchedule.ts の buildAttendanceNotificationContent と同じ役割で、
 * computeNotificationSchedule の結果を expo-notifications へ渡す本文に変換する。
 */
import type { ScheduledNotification, DeadlineReminderKind } from './schedule'

const REMAINDER_HOURS: Record<DeadlineReminderKind, string> = {
  'deadline-24h': '24時間',
  'deadline-3h': '3時間',
  'deadline-1h': '1時間',
}

export function buildAssignmentNotificationContent(
  n: ScheduledNotification,
): { title: string; body: string } {
  if (n.kind === 'morning-digest') {
    const parts: string[] = []
    if (n.dueToday > 0) parts.push(`今日締切 ${n.dueToday}件`)
    if (n.dueTomorrow > 0) parts.push(`明日締切 ${n.dueTomorrow}件`)
    return { title: '今日の課題', body: parts.join('・') }
  }
  return {
    title: `締切まで${REMAINDER_HOURS[n.kind]}`,
    body: `「${n.title}」の締切が近づいています`,
  }
}
