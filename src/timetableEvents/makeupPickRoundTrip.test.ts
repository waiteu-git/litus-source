import { describe, expect, it } from 'vitest'
import { parseBulletinDetail } from '../parsers/bulletinDetail'
import { DETAIL_CANCEL_MAKEUP, DETAIL_MAKEUP } from '../parsers/__fixtures__/loadEventDetails'
import type { BulletinItem } from '../storage/bulletinDigestSerialize'
import { candidateToClassEvent, parseBulletinEvents, reconcileCandidates } from './bulletinEvents'
import { makeupOccurrences, pickableMakeups, type ClassEvent } from './classEvent'
import { buildClassEventFromForm, EMPTY_COUNTDOWN_FORM, makeupFormValues } from './classEventForm'
import { buildClassEventNotifications } from './eventSchedule'
import { pickAttentionEvent } from './nextSession'
import { subjectEventRows } from './subjectEventRows'

/**
 * 【休講】と【補講】の掲示が別々に来て、それぞれ追加した端末で、休講の編集画面から補講を選ぶ往復
 * （設計 docs/design/2026-09-30-cancel-makeup-picker.md）。実採取 fixture を使う。
 *
 * 【休講】単独の実採取は無いので、実採取の【休講＆補講】から補講日の行だけを除いて作る（補講なしの休講＝undecided）。
 * 選ぶ前後を並べて比べる: 件数（発生1・通知3）は前後で同じなので、件数だけでは「選んだ」効果が見えない。
 * 変わるのは 要対応・科目詳細の行数・補講の出どころ・通知ID・候補の matchedEventId・保存された休講の補講の教室。
 */

const NOW = new Date(2026, 8, 1, 12, 0)

function itemFromHtml(id: string, category: string, title: string, html: string): BulletinItem {
  return { id, category, title, date: '2026/09/01', meta: '', unread: false, flagged: false, important: false, body: parseBulletinDetail(html) }
}
const CANCEL_ONLY_HTML = DETAIL_CANCEL_MAKEUP.replace(/<br>補講日：[^<]*/, '')
const X0 = itemFromHtml('b-cancel', '休講', '【休講】…図学・製図', CANCEL_ONLY_HTML)
const Y = itemFromHtml('b-makeup', '補講', '【補講】…図学・製図', DETAIL_MAKEUP)
const candX0 = parseBulletinEvents(X0)[0]
const candY = parseBulletinEvents(Y)[0]

/** 追加ボタンの経路: 候補を reconcile し、new のものだけ保存する。 */
function tapAdd(events: ClassEvent[], item: BulletinItem): ClassEvent[] {
  const next = [...events]
  for (const v of reconcileCandidates(parseBulletinEvents(item), events)) {
    if (v.state === 'new') next.push(candidateToClassEvent(v.candidate, v.candidate.sourceBulletinId))
  }
  return next
}

/** 休講の編集画面で保存する（onSave と同じ組み立て。科目名・コードはルート引数＝時間割側の値）。 */
function saveCancelForm(events: ClassEvent[], cancel: ClassEvent, form: { makeupStatus: 'has' | 'none' | 'undecided'; mkDate: string; mkPeriods: number[]; mkRoom: string }): ClassEvent[] {
  const saved = buildClassEventFromForm(
    {
      editId: cancel.id, courseName: cancel.courseName, courseCode: cancel.courseCode, type: 'cancel', date: cancel.date,
      periods: cancel.periods, room: '', note: '', ...form, countdown: EMPTY_COUNTDOWN_FORM,
    },
    NOW,
  )
  return events.map((e) => (e.id === cancel.id ? saved : e))
}

/** 選ぶ操作: pickableMakeups の候補から（指定が無ければ先頭を）選び、makeupFormValues で写して保存する。 */
function pickAndSave(events: ClassEvent[], cancel: ClassEvent, standaloneId?: string): ClassEvent[] {
  const cands = pickableMakeups(events, { courseName: cancel.courseName, courseCode: cancel.courseCode, date: cancel.date }, cancel.id)
  const chosen = standaloneId ? cands.find((e) => e.id === standaloneId) : cands[0]
  expect(chosen, `選べる候補に ${standaloneId ?? '(先頭)'} がある`).toBeDefined()
  return saveCancelForm(events, cancel, makeupFormValues(chosen!))
}

const notifIds = (events: ClassEvent[]) => buildClassEventNotifications(events, NOW).map((n) => n.id).sort()
const cancelOf = (events: ClassEvent[]) => events.find((e) => e.type === 'cancel')!
const rows = (events: ClassEvent[]) => subjectEventRows(reconcileCandidates([candX0, candY], events), events)

describe('前提: 実採取の【休講＆補講】から補講日の行を除くと、補講なしの休講の候補になる', () => {
  it('candX0 は休講（10/21・3限・補講なし）・candY は補講（9/23・3限）', () => {
    expect(candX0).toMatchObject({ type: 'cancel', date: '2026-10-21', periods: [3], makeup: null, courseCode: '9973415' })
    expect(candY).toMatchObject({ type: 'makeup', date: '2026-09-23', periods: [3], courseCode: '9973415' })
  })
})

describe('別々に追加した休講と補講: 選ぶ前後', () => {
  const before = tapAdd(tapAdd([], X0), Y)
  const c = cancelOf(before)
  const after = pickAndSave(before, c)

  it('選ぶ前: 休講は補講未定で要対応・補講の発生は単独側・通知の補講分は単独側の :eve/:day', () => {
    expect(c.makeupStatus).toBe('undecided')
    expect(pickAttentionEvent(before, NOW)?.id).toBe(c.id)
    expect(makeupOccurrences(before).map((o) => o.sourceId)).toEqual([before.find((e) => e.type === 'makeup')!.id])
    expect(notifIds(before)).toEqual([`${c.id}:day`, `${before[1].id}:day`, `${before[1].id}:eve`].sort())
    expect(rows(before).events).toHaveLength(2)
  })

  it('選んだ後: 要対応が消え、行は休講の1本・補講の出どころは休講・通知は休講の :mk に', () => {
    expect(pickAttentionEvent(after, NOW)).toBeNull()
    expect(rows(after).events.map((e) => e.id)).toEqual([c.id])
    expect(makeupOccurrences(after)).toHaveLength(1)
    expect(makeupOccurrences(after)[0]).toMatchObject({ sourceId: c.id, date: '2026-09-23', periods: [3] })
    expect(notifIds(after)).toEqual([`${c.id}:day`, `${c.id}:mk:day`, `${c.id}:mk:eve`].sort())
  })

  it('保存された休講の補講に、選んだ補講の日付・時限・教室が入る（教室は直接確かめる＝発生の教室は単独側が補うので検出できない）', () => {
    const saved = cancelOf(after)
    expect(saved.makeupStatus).toBe('has')
    expect(saved.makeup).toEqual({ date: '2026-09-23', periods: [3], room: '野：1211教室' })
  })

  it('両方の掲示の候補が「追加済み」で、matchedEventId は休講（追加ボタンは出ない）', () => {
    const views = reconcileCandidates([candX0, candY], after)
    expect(views.map((v) => v.state)).toEqual(['added', 'added'])
    expect(views.map((v) => v.matchedEventId)).toEqual([c.id, c.id])
    expect(rows(after).candidates).toHaveLength(0)
  })
})

describe('元に戻す: 自分で入力に切り替えて日程を変える／別の補講を選び直す／休講を消す', () => {
  const before = tapAdd(tapAdd([], X0), Y)
  const c = cancelOf(before)
  const s = before.find((e) => e.type === 'makeup')!
  const picked = pickAndSave(before, c)

  it('選んだあと、自分で入力で時限を変えて保存すると、元の補講が単独の補講として再び現れる', () => {
    const changed = saveCancelForm(picked, cancelOf(picked), { makeupStatus: 'has', mkDate: '2026-09-23', mkPeriods: [4], mkRoom: '野：1211教室' })
    expect(makeupOccurrences(changed)).toHaveLength(2)
    expect(rows(changed).events.map((e) => e.id).sort()).toEqual([c.id, s.id].sort())
  })

  it('補講なしへ戻しても、元の補講が現れる（休講は補講なし・要対応は出ない）', () => {
    const none = saveCancelForm(picked, cancelOf(picked), { makeupStatus: 'none', mkDate: '', mkPeriods: [], mkRoom: '' })
    expect(makeupOccurrences(none).map((o) => o.sourceId)).toEqual([s.id])
    expect(pickAttentionEvent(none, NOW)).toBeNull()
  })

  it('別の補講を選び直すと、最初に選んだ補講が戻り、選び直した方が隠れる', () => {
    const s2: ClassEvent = { ...s, id: 's2', date: '2026-09-30', periods: [4], room: '野：K404' }
    const two = [...before, s2]
    const first = pickAndSave(two, c, s.id)
    expect(makeupOccurrences(first)).toHaveLength(2) // s（休講が内包）＋ s2（単独）
    const second = pickAndSave(first, cancelOf(first), 's2')
    const shown = rows(second).events.map((e) => e.id).sort()
    expect(shown).toEqual([c.id, s.id].sort()) // s が単独として戻り、s2 は休講に覆われて見えない
    expect(makeupOccurrences(second).map((o) => o.date).sort()).toEqual(['2026-09-23', '2026-09-30'])
  })

  it('休講を消すと、補講は単独の補講として再び現れ、通知は単独側に戻る', () => {
    const del = picked.filter((e) => e.type !== 'cancel')
    expect(makeupOccurrences(del)).toHaveLength(1)
    expect(notifIds(del)).toEqual([`${s.id}:day`, `${s.id}:eve`].sort())
  })
})

describe('同じ補講は2つの休講に選べない', () => {
  it('1つ目の休講が選んだ補講は、2つ目の休講の候補に出ない（1つ目を編集する時は選択中として出る）', () => {
    const before = tapAdd(tapAdd([], X0), Y)
    const c1 = cancelOf(before)
    const c2: ClassEvent = { ...c1, id: 'c2', date: '2026-11-04' }
    const picked = pickAndSave([...before, c2], c1)
    const cur = (id: string, date: string) => pickableMakeups(picked, { courseName: c1.courseName, courseCode: c1.courseCode, date }, id)
    expect(cur('c2', '2026-11-04')).toEqual([])
    expect(cur(c1.id, c1.date).map((e) => e.date)).toEqual(['2026-09-23'])
  })
})
