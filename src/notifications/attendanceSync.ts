/** 保存済み時間割＋科目別設定→出席アラームを再計算して端末に再同期する。 */
import { loadTimetable } from '../storage/timetableStore'
import { loadAttendanceSettings } from '../storage/attendanceSettingsStore'
import { computeAttendanceAlarms } from './attendanceSchedule'
import { syncAttendanceAlarms } from './notifier'

export async function refreshAttendanceAlarms(now: Date = new Date()): Promise<void> {
  const collections = await loadTimetable()
  if (!collections) {
    await syncAttendanceAlarms([])
    return
  }
  const settings = await loadAttendanceSettings()
  const alarms = computeAttendanceAlarms(collections, settings, now)
  await syncAttendanceAlarms(alarms)
}
