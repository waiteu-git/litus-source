/**
 * ホームの「出席お知らせバナー」の表示内容を決める純粋関数。
 *
 * 表示条件（ユーザー仕様の「または」）:
 *   bannerActive = CLASSが受付中 || 時間割上で授業がある（授業時間帯）
 * 受付確定（reception.accepting）は授業時間帯より優先し、確定文言を出す。
 * 端末非依存・now注入で決定論的（vitestでテスト可能）。判定はここに集約し、UI（HomeScreen）は
 * 収縮アニメと遷移だけを担う。
 */
import type { TimetableCollection } from '../collect/timetableMessage'
import type { AttendanceReception } from '../collect/attendanceMessage'
import type { DayOfWeek } from '../parsers/timetable'

const WEEKDAY: Record<DayOfWeek, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }

function hhmmToMin(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

export type ActiveClass = { courseCode: string; courseName: string }

/**
 * now が「登録授業のある時限の時間帯内（開始 preMinutes 前〜終了）」なら、その科目を返す。
 * isInClassPeriod と同じ判定だが、バナー文言のため科目名も返す点が異なる。複数該当時は先勝ち。
 */
export function findActiveClass(
  collections: TimetableCollection[],
  now: Date,
  preMinutes = 5,
): ActiveClass | null {
  const weekday = now.getDay()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  for (const col of collections) {
    const periods = col.periodTimes?.periods ?? []
    for (const slot of col.slots) {
      if (slot.classes.length === 0) continue
      if (WEEKDAY[slot.day] !== weekday) continue
      const pt = periods.find((p) => p.period === slot.period)
      if (!pt) continue
      const start = hhmmToMin(pt.start)
      const end = hhmmToMin(pt.end)
      if (start === null || end === null) continue
      if (nowMin >= start - preMinutes && nowMin <= end) {
        const c = slot.classes[0]
        return { courseCode: c.courseCode, courseName: c.name }
      }
    }
  }
  return null
}

export type HomeBannerKind = 'accepting' | 'class-time' | 'none'

export type HomeBanner = {
  active: boolean
  kind: HomeBannerKind
  courseName: string | null
  text: string
}

const INACTIVE: HomeBanner = { active: false, kind: 'none', courseName: null, text: '' }

export function computeHomeBanner(
  collections: TimetableCollection[],
  reception: AttendanceReception | null,
  now: Date,
): HomeBanner {
  // 受付確定が最優先（時間割に無い補講等も拾える）。
  if (reception?.accepting) {
    const name = reception.courseName?.trim() || '授業'
    return { active: true, kind: 'accepting', courseName: reception.courseName, text: `${name} 出席登録受付中` }
  }
  // 次に時間割上の授業時間帯。受付は未確認だが「出席を確認」ナッジを出す。
  const active = findActiveClass(collections, now)
  if (active) {
    return {
      active: true,
      kind: 'class-time',
      courseName: active.courseName,
      text: `${active.courseName} の時間です・出席を確認`,
    }
  }
  return INACTIVE
}
