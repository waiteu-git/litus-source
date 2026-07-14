import AsyncStorage from '@react-native-async-storage/async-storage'
import { deserializeCourseNews, serializeCourseNews } from './courseNewsSerialize'
import type { CourseNewsMap } from '../updates/courseNews'
import { createWriteQueue } from './writeQueue'

const KEY = 'letus.courseNews.v1'

const enqueueWrite = createWriteQueue()

/** LETUS新着の累積（コースURL→未読の活動）。 */
export async function loadCourseNews(): Promise<CourseNewsMap> {
  return deserializeCourseNews(await AsyncStorage.getItem(KEY))
}

/** 直列キュー内でread-modify-write（同期run転記と既読操作の同時進行によるlost update回避）。更新後を返す。 */
export async function mutateCourseNews(mutate: (map: CourseNewsMap) => CourseNewsMap): Promise<CourseNewsMap> {
  return enqueueWrite(async () => {
    const next = mutate(await loadCourseNews())
    await AsyncStorage.setItem(KEY, serializeCourseNews(next))
    return next
  })
}
