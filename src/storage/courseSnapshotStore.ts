import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  serializeCourseSnapshots,
  deserializeCourseSnapshots,
  type CourseSnapshotMap,
} from './courseSnapshotSerialize'

const KEY = 'letus.courseSnapshots.v1'

export async function saveCourseSnapshots(m: CourseSnapshotMap): Promise<void> {
  await AsyncStorage.setItem(KEY, serializeCourseSnapshots(m))
}

export async function loadCourseSnapshots(): Promise<CourseSnapshotMap> {
  return deserializeCourseSnapshots(await AsyncStorage.getItem(KEY))
}
