import { parseMyCourses, type LetusCourse } from '../parsers/letusCourses'
import { MYCOURSES_URL } from './injectedScripts'

export type MyCoursesResult = { courses: LetusCourse[]; error: string | null }

const PARSE_ERROR = 'メッセージを解析できませんでした'
const EMPTY_ERROR = 'コースを取得できませんでした'
const WRONG_PAGE_ERROR = 'コース一覧ページ（マイコース）で実行してください'

/**
 * 収集元が my/courses.php 本体か。コースページにも course/view.php リンク（パンくず等）はあるため、
 * HTML の中身だけでは「マイコースで収集した」ことを判定できない＝収集元URLで弾く必要がある。
 *
 * クエリ/ハッシュ/末尾スラッシュは許容する（ここを厳しくすると正常な全コース同期まで止まる）。
 * 一方でホストは完全一致（サフィックス一致だと letus...ac.jp.evil.com が通る）、パスも完全一致
 * （前方一致だと /my/courses.php/extra、部分一致だと ?returnurl=/my/courses.php が通る）。
 * RN 0.86 の URL 実装は pathname/hostname を自前の正規表現で解決し Node の本物 URL と挙動が
 * 食い違うため、new URL() ではなく正規表現で分解する。
 */
export function isMyCoursesUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false
  const t = /^https:\/\/([^/?#]+)([^?#]*)/i.exec(MYCOURSES_URL)
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)([^?#]*)/i.exec(url.trim())
  if (!t || !m) return false
  if (m[1].toLowerCase() !== 'https') return false
  const host = m[2].toLowerCase().replace(/:443$/, '')
  if (host !== t[1].toLowerCase()) return false
  return m[3].replace(/\/+$/, '') === t[2].replace(/\/+$/, '')
}

export function parseMyCoursesMessage(raw: string): MyCoursesResult {
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return { courses: [], error: PARSE_ERROR }
  }
  if (typeof payload !== 'object' || payload === null) return { courses: [], error: PARSE_ERROR }
  const p = payload as { type?: unknown; html?: unknown; origin?: unknown; url?: unknown }
  if (p.type !== 'mycourses' || typeof p.html !== 'string') return { courses: [], error: PARSE_ERROR }
  if (!isMyCoursesUrl(p.url)) return { courses: [], error: WRONG_PAGE_ERROR }
  const origin = typeof p.origin === 'string' ? p.origin : 'https://letus.ed.tus.ac.jp'
  const courses = parseMyCourses(p.html, origin)
  if (courses.length === 0) return { courses: [], error: EMPTY_ERROR }
  return { courses, error: null }
}
