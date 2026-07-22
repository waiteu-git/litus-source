import { describe, expect, it } from 'vitest'
import { subjectEventsHeaderSlots } from './eventsHeader'
import type { ClassEvent, ClassEventType, MakeupStatus } from '../timetableEvents/classEvent'

function ev(type: ClassEventType, makeupStatus?: MakeupStatus): ClassEvent {
  return {
    id: 'e1',
    courseName: '情報リテラシー演習',
    courseCode: '1234567',
    type,
    date: '2026-07-24',
    periods: [1],
    room: null,
    note: null,
    createdAt: '2026-07-20T00:00:00.000Z',
    ...(makeupStatus ? { makeupStatus } : {}),
  }
}

describe('subjectEventsHeaderSlots', () => {
  it('要対応なしなら追加ボタンだけ', () => {
    expect(subjectEventsHeaderSlots(null)).toEqual({ attentionPill: false, addButton: true })
  })

  it('休講かつ補講未定なら要対応ピルを出す', () => {
    expect(subjectEventsHeaderSlots(ev('cancel', 'undecided'))).toEqual({ attentionPill: true, addButton: true })
  })

  it('補講が決まっていれば要対応ピルは出さない', () => {
    expect(subjectEventsHeaderSlots(ev('cancel', 'has'))).toEqual({ attentionPill: false, addButton: true })
    expect(subjectEventsHeaderSlots(ev('cancel', 'none'))).toEqual({ attentionPill: false, addButton: true })
    expect(subjectEventsHeaderSlots(ev('cancel'))).toEqual({ attentionPill: false, addButton: true })
  })

  it('休講以外は要対応ピルを出さない', () => {
    for (const t of ['roomChange', 'makeup', 'quiz', 'midterm', 'final', 'other'] as const) {
      expect(subjectEventsHeaderSlots(ev(t, 'undecided')).attentionPill).toBe(false)
    }
  })

  it('どの状態でも追加ボタンは消えない（アコーディオンが閉じていても押せる、が本件の本質）', () => {
    const cases = [null, ev('cancel', 'undecided'), ev('cancel', 'has'), ev('roomChange'), ev('final')]
    for (const c of cases) expect(subjectEventsHeaderSlots(c).addButton).toBe(true)
  })
})
