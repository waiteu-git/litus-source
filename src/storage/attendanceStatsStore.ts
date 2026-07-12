import AsyncStorage from '@react-native-async-storage/async-storage'
import type { AttendanceCourseStats } from '../parsers/attendanceStats'
import {
  serializeAttendanceStats,
  deserializeAttendanceStats,
  type AttendanceStatsData,
} from './attendanceStatsSerialize'

const KEY = 'attendance.stats.v1'

export async function saveAttendanceStats(courses: AttendanceCourseStats[], collectedAt = Date.now()): Promise<void> {
  await AsyncStorage.setItem(KEY, serializeAttendanceStats({ courses, collectedAt }))
}

export async function loadAttendanceStats(): Promise<AttendanceStatsData | null> {
  return deserializeAttendanceStats(await AsyncStorage.getItem(KEY))
}

export async function clearAttendanceStats(): Promise<void> {
  await AsyncStorage.removeItem(KEY)
}
