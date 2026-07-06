/** 保存済み課題→締切前リマインダー＋朝まとめを再計算して端末に再同期する。 */
import { loadAssignments } from '../storage/assignmentsStore'
import { computeNotificationSchedule, type SchedulableAssignment } from './schedule'
import { syncAssignmentReminders } from './notifier'
import type { AssignmentMap } from '../storage/assignmentsSerialize'

function toSchedulable(map: AssignmentMap): SchedulableAssignment[] {
  return Object.values(map)
    .filter((a) => !a.ignored)
    .map((a) => ({
      id: a.url,
      title: a.title,
      deadline: a.deadline,
      submissionStatus: a.submissionStatus,
    }))
}

export async function refreshAssignmentReminders(now: Date = new Date()): Promise<void> {
  const map = await loadAssignments()
  const notifications = computeNotificationSchedule(toSchedulable(map), now)
  await syncAssignmentReminders(notifications)
}
