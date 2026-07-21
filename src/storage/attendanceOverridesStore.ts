import { Storage } from './asyncStorage'
import {
  serializeAttendanceOverrides,
  deserializeAttendanceOverrides,
  type AttendanceOverride,
  type AttendanceOverrides,
} from './attendanceOverridesSerialize'

const KEY = 'attendance.overrides.v1'

export async function loadAttendanceOverrides(): Promise<AttendanceOverrides> {
  return deserializeAttendanceOverrides(await Storage.getItem(KEY))
}

export async function saveAttendanceOverride(courseCode: string, override: AttendanceOverride): Promise<void> {
  const all = await loadAttendanceOverrides()
  all[courseCode] = override
  await Storage.setItem(KEY, serializeAttendanceOverrides(all))
}
