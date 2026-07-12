import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  serializeAttendanceOverrides,
  deserializeAttendanceOverrides,
  type AttendanceOverride,
  type AttendanceOverrides,
} from './attendanceOverridesSerialize'

const KEY = 'attendance.overrides.v1'

export async function loadAttendanceOverrides(): Promise<AttendanceOverrides> {
  return deserializeAttendanceOverrides(await AsyncStorage.getItem(KEY))
}

export async function saveAttendanceOverride(courseCode: string, override: AttendanceOverride): Promise<void> {
  const all = await loadAttendanceOverrides()
  all[courseCode] = override
  await AsyncStorage.setItem(KEY, serializeAttendanceOverrides(all))
}
