import AsyncStorage from '@react-native-async-storage/async-storage'
import { deserializeTrackedCourses, serializeTrackedCourses } from './trackedCoursesSerialize'

const KEY = 'letus.trackedCourses.v1'

/** ユーザーが追跡ONにしたLETUS専用コースのURL集合（自動収集パイプラインへ合流させる）。 */
export async function loadTrackedCourses(): Promise<string[]> {
  return deserializeTrackedCourses(await AsyncStorage.getItem(KEY))
}

export async function saveTrackedCourses(urls: string[]): Promise<void> {
  await AsyncStorage.setItem(KEY, serializeTrackedCourses(urls))
}
