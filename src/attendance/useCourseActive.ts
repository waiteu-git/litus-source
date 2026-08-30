import { useCallback, useEffect, useState } from 'react'
import { loadAttendanceStats } from '../storage/attendanceStatsStore'
import { loadClassEvents } from '../storage/classEventsStore'
import { loadBulletinDigest } from '../storage/bulletinDigestStore'
import { useClassEventsVersion } from '../timetableEvents/classEventsVersion'
import { dateToYmd } from '../timetableEvents/eventDateValue'
import { loadKillSwitchCache } from '../storage/killSwitchStore'
import { buildCourseTermInfo, isCourseActiveOn, type CourseTermInfo } from './courseOver'
import type { ClassActivePredicate } from './homeBanner'

const EMPTY: CourseTermInfo = { termEnds: {}, nameOwners: {}, extraPlans: [], calendar: null }

/**
 * computeHomeBanner に渡す「その科目にまだ出席案内を出すか」の述語を組む。
 * 判定も入力の組み立ても courseOver.ts の純粋関数（テスト済み）で、ここは読み込みだけを担う。
 * ホームのバナーと全画面共通FABの**両方**に同じ述語を渡すこと（片方だけだと不整合になる）。
 *
 * 同じ述語を予約通知側（notificationRefresh）も通る。画面だけに入れた対策は通知に効かない。
 *
 * 3つの読み込みを**まとめて1回で反映する**: 最終授業日だけ先に入って追加の予定が空の瞬間があると、
 * 学期終了後の補講が一瞬「終了済み」に見える。どれかが失敗したら全部空＝従来どおり出す（fail-open）。
 */
export function useCourseActive(now: Date): ClassActivePredicate {
  const { version } = useClassEventsVersion()
  const [info, setInfo] = useState<CourseTermInfo>(EMPTY)

  useEffect(() => {
    let active = true
    Promise.all([loadAttendanceStats(), loadClassEvents(), loadBulletinDigest(), loadKillSwitchCache()])
      .then(([stats, events, bulletins, ks]) => {
        if (!active) return
        setInfo(
          buildCourseTermInfo({
            courses: stats?.courses ?? [], events, bulletins, now: new Date(),
            calendar: ks?.status.calendar ?? null,
          }),
        )
      })
      .catch(() => {
        if (active) setInfo(EMPTY)
      })
    return () => {
      active = false
    }
  }, [version])

  const dateKey = dateToYmd(now)
  return useCallback(
    (courseCode: string, courseName: string) =>
      isCourseActiveOn({
        courseCode,
        courseName,
        dateKey,
        termEnds: info.termEnds,
        nameOwners: info.nameOwners,
        calendar: info.calendar,
        extraPlans: info.extraPlans,
      }),
    [dateKey, info],
  )
}
