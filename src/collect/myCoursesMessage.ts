import { parseMyCourses, type LetusCourse } from '../parsers/letusCourses'

export type MyCoursesResult = { courses: LetusCourse[]; error: string | null }

const PARSE_ERROR = 'メッセージを解析できませんでした'
const EMPTY_ERROR = 'コースを取得できませんでした'

export function parseMyCoursesMessage(raw: string): MyCoursesResult {
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return { courses: [], error: PARSE_ERROR }
  }
  if (typeof payload !== 'object' || payload === null) return { courses: [], error: PARSE_ERROR }
  const p = payload as { type?: unknown; html?: unknown; origin?: unknown }
  if (p.type !== 'mycourses' || typeof p.html !== 'string') return { courses: [], error: PARSE_ERROR }
  const origin = typeof p.origin === 'string' ? p.origin : 'https://letus.ed.tus.ac.jp'
  const courses = parseMyCourses(p.html, origin)
  if (courses.length === 0) return { courses: [], error: EMPTY_ERROR }
  return { courses, error: null }
}
