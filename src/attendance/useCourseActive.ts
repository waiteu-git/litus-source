import { useCallback, useEffect, useState } from 'react'
import { loadAttendanceStats } from '../storage/attendanceStatsStore'
import { loadClassEvents } from '../storage/classEventsStore'
import { loadBulletinDigest } from '../storage/bulletinDigestStore'
import { parseBulletinEvents } from '../timetableEvents/bulletinEvents'
import { useClassEventsVersion } from '../timetableEvents/classEventsVersion'
import { dateToYmd } from '../timetableEvents/eventDateValue'
import {
  courseTermEnds,
  extraPlansFromCandidates,
  extraPlansFromEvents,
  isCourseActiveOn,
  type ExtraPlan,
} from './courseOver'
import type { ClassActivePredicate } from './homeBanner'

/**
 * computeHomeBanner に渡す「その科目にまだ出席案内を出すか」の述語を組む。
 * 判定そのものは courseOver.ts の純粋関数（テスト済み）で、ここは読み込みと束ねだけを担う。
 * ホームのバナーと全画面共通FABの**両方**に同じ述語を渡すこと（片方だけだと不整合になる）。
 */
export function useCourseActive(now: Date): ClassActivePredicate {
  const { version } = useClassEventsVersion()
  const [termEnds, setTermEnds] = useState<Record<string, string>>({})
  const [extraPlans, setExtraPlans] = useState<ExtraPlan[]>([])

  useEffect(() => {
    let active = true
    loadAttendanceStats()
      .then((d) => {
        if (active && d) setTermEnds(courseTermEnds(d.courses, new Date()))
      })
      .catch(() => undefined)
    Promise.all([loadClassEvents(), loadBulletinDigest()])
      .then(([events, digest]) => {
        if (!active) return
        const cands = digest.flatMap((b) => parseBulletinEvents(b))
        setExtraPlans([...extraPlansFromEvents(events), ...extraPlansFromCandidates(cands)])
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [version])

  const dateKey = dateToYmd(now)
  return useCallback(
    (courseCode: string, courseName: string) =>
      isCourseActiveOn({ courseCode, courseName, dateKey, termEnds, extraPlans }),
    [dateKey, termEnds, extraPlans],
  )
}
