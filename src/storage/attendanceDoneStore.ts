import AsyncStorage from '@react-native-async-storage/async-storage'
import type { AttendedRecord } from '../attendance/attendedState'

const KEY = 'attendance.done.v1'

export async function saveAttendedRecord(r: AttendedRecord): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(r))
}

export async function loadAttendedRecord(): Promise<AttendedRecord | null> {
  const raw = await AsyncStorage.getItem(KEY)
  if (!raw) return null
  try {
    const p = JSON.parse(raw) as Partial<AttendedRecord>
    if (typeof p?.date === 'string' && typeof p?.code === 'string' && typeof p?.courseName === 'string') {
      return {
        date: p.date,
        courseName: p.courseName,
        confirmWindow: typeof p.confirmWindow === 'string' ? p.confirmWindow : null,
        code: p.code,
      }
    }
  } catch {
    // 壊れていれば無視
  }
  return null
}
