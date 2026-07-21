import { Storage } from './asyncStorage'
import {
  serializeCourseSnapshots,
  deserializeCourseSnapshots,
  type CourseSnapshotMap,
} from './courseSnapshotSerialize'

const KEY = 'letus.courseSnapshots.v1'

export async function saveCourseSnapshots(m: CourseSnapshotMap): Promise<void> {
  await Storage.setItem(KEY, serializeCourseSnapshots(m))
}

export async function loadCourseSnapshots(): Promise<CourseSnapshotMap> {
  return deserializeCourseSnapshots(await Storage.getItem(KEY))
}
