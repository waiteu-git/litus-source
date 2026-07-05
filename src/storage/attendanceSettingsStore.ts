import AsyncStorage from '@react-native-async-storage/async-storage'
import type { AttendanceAlarmSettings } from '../notifications/attendanceSchedule'
import { serializeAttendanceSettings, deserializeAttendanceSettings } from './attendanceSettingsSerialize'

const KEY = 'attendance.alarm.settings.v1'

export async function saveAttendanceSettings(s: AttendanceAlarmSettings): Promise<void> {
  await AsyncStorage.setItem(KEY, serializeAttendanceSettings(s))
}

export async function loadAttendanceSettings(): Promise<AttendanceAlarmSettings> {
  const raw = await AsyncStorage.getItem(KEY)
  return deserializeAttendanceSettings(raw)
}
