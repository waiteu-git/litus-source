import { Storage } from './asyncStorage'
import type { AttendanceAlarmSettings } from '../notifications/attendanceSchedule'
import { serializeAttendanceSettings, deserializeAttendanceSettings } from './attendanceSettingsSerialize'

const KEY = 'attendance.alarm.settings.v1'

export async function saveAttendanceSettings(s: AttendanceAlarmSettings): Promise<void> {
  await Storage.setItem(KEY, serializeAttendanceSettings(s))
}

export async function loadAttendanceSettings(): Promise<AttendanceAlarmSettings> {
  const raw = await Storage.getItem(KEY)
  return deserializeAttendanceSettings(raw)
}
