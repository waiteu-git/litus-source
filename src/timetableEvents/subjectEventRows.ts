import type { CandidateView } from './bulletinEvents'
import { coveredStandaloneMakeups, type ClassEvent } from './classEvent'

export type SubjectEventRows = {
  /** 「各回の予定」に出す掲示候補（畳まれなかったもの）。 */
  candidates: CandidateView[]
  /** 「各回の予定」に出す登録済みの予定（隠されなかったもの）。 */
  events: ClassEvent[]
}

/**
 * 科目詳細「各回の予定」に出す行を決める（設計 2026-09-29 §2.3）。データは書き換えず、表示だけを畳む。
 *
 * - 登録済みの予定: 内包補講に覆われた単独補講（同じ補講が休講の側にも入っている）は隠す。
 *   ただしメモ(note)が空でないものは隠さない＝手動登録のメモに画面から届かなくなるのを避ける。
 * - 掲示候補: 追加済み(added)で、対応する予定が**この一覧に見えている**ものだけ畳む（上下の二重を避ける）。
 *   予定が別名で一覧に無い・隠した単独補講を指す、といった場合は畳まない＝候補も予定も見えなくなる事故を防ぐ。
 *   追加が要る候補(new)・補講の追記が要る候補(makeupAppend)は必ず残す。
 */
export function subjectEventRows(candidates: CandidateView[], events: ClassEvent[]): SubjectEventRows {
  const covered = coveredStandaloneMakeups(events)
  const hidden = new Set<string>()
  for (const e of events) if (covered.has(e.id) && !(e.note ?? '').trim()) hidden.add(e.id)

  const visibleEvents = events.filter((e) => !hidden.has(e.id))
  const visibleIds = new Set(visibleEvents.map((e) => e.id))
  const visibleCandidates = candidates.filter(
    (v) => !(v.state === 'added' && v.matchedEventId != null && visibleIds.has(v.matchedEventId)),
  )
  return { candidates: visibleCandidates, events: visibleEvents }
}
