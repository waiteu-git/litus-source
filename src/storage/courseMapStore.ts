import AsyncStorage from '@react-native-async-storage/async-storage'
import type { CourseCodeMap } from '../parsers/letusCourses'
import { serializeCourseMap, deserializeCourseMap } from './courseMapSerialize'

const KEY = 'letus.courseMap.v1'

export async function saveCourseMap(map: CourseCodeMap): Promise<void> {
  await AsyncStorage.setItem(KEY, serializeCourseMap(map))
}

export async function loadCourseMap(): Promise<CourseCodeMap> {
  return deserializeCourseMap(await AsyncStorage.getItem(KEY))
}
