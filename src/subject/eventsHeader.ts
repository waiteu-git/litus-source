import type { ClassEvent } from '../timetableEvents/classEvent'

export type SubjectEventsHeaderSlots = {
  attentionPill: boolean
  addButton: boolean
}

/**
 * 科目詳細「各回の予定」ヘッダ右スロットの構成。
 * 追加ボタンは常設（アコーディオンの開閉・要対応の有無に依存しない）＝閉じていても押せる。
 */
export function subjectEventsHeaderSlots(attention: ClassEvent | null): SubjectEventsHeaderSlots {
  return {
    attentionPill: !!attention && attention.type === 'cancel' && attention.makeupStatus === 'undecided',
    addButton: true,
  }
}
