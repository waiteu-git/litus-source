import { useEffect, useState } from 'react'
import { loadBulletinDigest } from '../storage/bulletinDigestStore'
import { loadClassEvents } from '../storage/classEventsStore'
import { parseBulletinEvents, reconcileCandidates, type CandidateView } from './bulletinEvents'
import { useClassEventsVersion } from './classEventsVersion'

const norm = (s: string) => s.replace(/[\s　]/g, '')

/**
 * この科目に紐づく掲示イベント候補（new/added/makeupAppend）を供給するフック。
 * 掲示digest（開封済みは body キャッシュ込み）を全件パースし、コード一致（無ければ名称一致）で
 * この科目分だけ残し、既存 ClassEvent と突合する。ClassEvent 追加後は version 依存で再計算。
 */
export function useBulletinEventCandidates(courseCode: string, courseName: string): CandidateView[] {
  const { version } = useClassEventsVersion()
  const [views, setViews] = useState<CandidateView[]>([])

  useEffect(() => {
    let active = true
    ;(async () => {
      const digest = await loadBulletinDigest()
      const all = digest.flatMap((it) => parseBulletinEvents(it))
      const mine = all.filter((c) =>
        c.courseCode ? c.courseCode === courseCode : norm(c.courseName) === norm(courseName),
      )
      const events = (await loadClassEvents()).filter((e) =>
        e.courseCode ? e.courseCode === courseCode : norm(e.courseName) === norm(courseName),
      )
      const reconciled = reconcileCandidates(mine, events)
      if (active) setViews(reconciled)
    })().catch(() => undefined)
    return () => {
      active = false
    }
  }, [courseCode, courseName, version])

  return views
}
