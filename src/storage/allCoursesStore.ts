import AsyncStorage from '@react-native-async-storage/async-storage'
import type { LetusCourse } from '../parsers/letusCourses'
import { deserializeAllCourses, serializeAllCourses } from './allCoursesSerialize'

const KEY = 'letus.allCourses.v1'

export async function loadAllCourses(): Promise<LetusCourse[]> {
  return deserializeAllCourses(await AsyncStorage.getItem(KEY))
}

/** 空配列は保存しない（SSO空振り回で候補一覧を消さない。courseMapと同じ「取れた時だけ更新」原則）。 */
export async function saveAllCourses(courses: LetusCourse[]): Promise<void> {
  if (courses.length === 0) return
  await AsyncStorage.setItem(KEY, serializeAllCourses(courses))
}
