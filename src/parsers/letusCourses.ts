/**
 * LETUSマイコース(my/courses.php)HTMLからコースを抽出し、CLASS科目コード→LETUSコースの対応表を作る。
 * LETUSコース名にはCLASS7桁コードが埋め込まれている（統合コースは複数、特別コースは無し）。
 */
import { extractLinksFromHtml } from './letusLinks'
import { extractCourseCodes } from './courseCode'

export type LetusCourse = { name: string; url: string; codes: string[] }
export type CourseCodeMap = Record<string, LetusCourse>

export function extractCourseCodesFromName(name: string): string[] {
  // 科目IDは英字を含むことがある（9975A06 等）。数字7桁固定だと当該コースが消える。
  return extractCourseCodes(name)
}

export function parseMyCourses(html: string, origin: string): LetusCourse[] {
  const links = extractLinksFromHtml(html, origin)
  const seen = new Set<string>()
  const courses: LetusCourse[] = []
  for (const l of links) {
    if (!/\/course\/view\.php\?id=\d+/.test(l.url)) continue
    if (seen.has(l.url)) continue
    seen.add(l.url)
    courses.push({ name: l.title, url: l.url, codes: extractCourseCodesFromName(l.title) })
  }
  return courses
}

export function buildCourseCodeMap(courses: LetusCourse[]): CourseCodeMap {
  const map: CourseCodeMap = {}
  for (const c of courses) {
    for (const code of c.codes) map[code] = c
  }
  return map
}
