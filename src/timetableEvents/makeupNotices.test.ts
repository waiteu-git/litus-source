import { describe, expect, it } from 'vitest'
import { parseBulletinDetail } from '../parsers/bulletinDetail'
import { DETAIL_CANCEL_MAKEUP, DETAIL_MAKEUP } from '../parsers/__fixtures__/loadEventDetails'
import type { BulletinItem } from '../storage/bulletinDigestSerialize'
import { candidateToClassEvent, parseBulletinEvents, reconcileCandidates } from './bulletinEvents'
import { coveredStandaloneMakeups, type ClassEvent } from './classEvent'
import { buildClassEventFromForm, EMPTY_COUNTDOWN_FORM, makeupFormNotices, makeupFormValues } from './classEventForm'
import { makeupNoticeText } from './eventLabels'

/**
 * 編集中の注記（設計 docs/design/2026-09-30-cancel-makeup-picker.md §2.4）。
 * 覆いは派生なので、休講の補講の日程を変えると、隠れていた追加済みの補講が別の補講として再び現れる（元に戻る）。
 * 保存前にそれを知らせる（保存は止めない）。
 */

const standalone = (o: Partial<ClassEvent> = {}): ClassEvent => ({
  id: 's1', courseName: '図学・製図', courseCode: '9973415', type: 'makeup', date: '2026-09-23', periods: [3],
  room: '野：1211教室', note: null, createdAt: 't', ...o,
})
const stored = (o: Partial<ClassEvent> = {}): ClassEvent => ({
  id: 'c1', courseName: '図学・製図', courseCode: '9973415', type: 'cancel', date: '2026-10-21', periods: [3],
  room: null, note: null, createdAt: 't', makeupStatus: 'has',
  makeup: { date: '2026-09-23', periods: [3], room: '野：1211教室' }, ...o,
})
const route = { courseName: '図学・製図', courseCode: '9973415', date: '2026-10-21' }
const form = (o: Partial<{ makeupStatus: 'has' | 'none' | 'undecided'; mkDate: string; mkPeriods: number[]; mkRoom: string }> = {}) => ({
  ...route, makeupStatus: 'has' as const, mkDate: '2026-09-23', mkPeriods: [3], mkRoom: '野：1211教室', ...o,
})
const ids = (l: ClassEvent[]) => l.map((e) => e.id)

describe('makeupFormNotices: 今のフォームの値だと、追加済みの補講が別の補講として表示・通知される', () => {
  describe('保存済みの休講が覆っている補講（選んだあと・元に戻る）', () => {
    const events = [stored(), standalone()]
    it('値が今のままなら出さない（覆われたまま）', () => {
      expect(makeupFormNotices(events, 'c1', form(), 'manual')).toEqual([])
      expect(makeupFormNotices(events, 'c1', form(), 'pick')).toEqual([])
    })
    it('教室だけ変えても出さない（覆いは日付・コマ集合だけを見る）', () => {
      expect(makeupFormNotices(events, 'c1', form({ mkRoom: 'K404' }), 'manual')).toEqual([])
    })
    it('日付・時限を変える／補講なし・未定へ戻すと出す', () => {
      expect(ids(makeupFormNotices(events, 'c1', form({ mkPeriods: [3, 4] }), 'manual'))).toEqual(['s1'])
      expect(ids(makeupFormNotices(events, 'c1', form({ mkDate: '2026-09-30' }), 'manual'))).toEqual(['s1'])
      expect(ids(makeupFormNotices(events, 'c1', form({ makeupStatus: 'none' }), 'manual'))).toEqual(['s1'])
      expect(ids(makeupFormNotices(events, 'c1', form({ makeupStatus: 'undecided', mkDate: '', mkPeriods: [] }), 'pick'))).toEqual(['s1'])
    })
    it('別の補講を選び直すと、元の補講について出す（選び直した方は覆われる）', () => {
      const s2 = standalone({ id: 's2', date: '2026-09-30', periods: [4], room: '野：K404' })
      const both = [stored(), standalone(), s2]
      expect(ids(makeupFormNotices(both, 'c1', form({ ...makeupFormValues(s2) }), 'pick'))).toEqual(['s1'])
    })
  })

  describe('同じ日で時限だけ違う手入力（新規・補講未定の休講から）', () => {
    const events = [standalone()]
    it('補講あり・同じ日・時限が違う → 出す。一致すれば出さない（一致すると覆われる）', () => {
      expect(ids(makeupFormNotices(events, undefined, form({ mkPeriods: [3, 4] }), 'manual'))).toEqual(['s1'])
      expect(makeupFormNotices(events, undefined, form(), 'manual')).toEqual([])
    })
    it('別の日の手入力は無関係な補講なので出さない', () => {
      expect(makeupFormNotices(events, undefined, form({ mkDate: '2026-09-30' }), 'manual')).toEqual([])
    })
    it('補講あり以外では、保存済みの覆いが無ければ出さない（補講なし・未定の休講は補講と無関係）', () => {
      const undecided = stored({ makeupStatus: 'undecided', makeup: null })
      expect(makeupFormNotices([undecided, standalone()], 'c1', form({ makeupStatus: 'undecided', mkDate: '', mkPeriods: [] }), 'manual')).toEqual([])
      expect(makeupFormNotices([undecided, standalone()], 'c1', form({ makeupStatus: 'none' }), 'manual')).toEqual([])
    })
  })

  describe('候補から選ぶモードの未選択（保存できない状態）では出さない', () => {
    it('補講あり・未選択（非表示の手入力の値が残っていても）', () => {
      const events = [standalone()]
      expect(makeupFormNotices(events, undefined, form({ mkDate: '2026-09-23', mkPeriods: [3, 4] }), 'pick')).toEqual([])
      expect(makeupFormNotices(events, undefined, form({ mkDate: '', mkPeriods: [] }), 'pick')).toEqual([])
    })
  })

  describe('対象にしないもの', () => {
    it('他の休講に覆われた補講・別の授業・単独補講以外は対象外', () => {
      const other = stored({ id: 'c-other', date: '2026-11-04' })
      expect(makeupFormNotices([other, standalone()], undefined, form({ mkPeriods: [3, 4] }), 'manual')).toEqual([])
      const diffCourse = standalone({ courseCode: '1111111' })
      expect(makeupFormNotices([diffCourse], undefined, form({ mkPeriods: [3, 4] }), 'manual')).toEqual([])
      expect(makeupFormNotices([standalone({ type: 'roomChange' })], undefined, form({ mkPeriods: [3, 4] }), 'manual')).toEqual([])
    })
    it('編集中の予定自身は対象外／保存済みの休講が他に2件同じ補講を持つ既存データでも誤警報にならない', () => {
      expect(makeupFormNotices([standalone({ id: 'me' })], 'me', form({ mkPeriods: [3, 4] }), 'manual')).toEqual([])
      const cA = stored({ id: 'cA' })
      const cB = stored({ id: 'cB', date: '2026-11-04' })
      // cA を編集して補講日を変えても、s は cB が覆っている（他の休講に覆われた補講）ので出さない
      expect(makeupFormNotices([cA, cB, standalone()], 'cA', form({ mkDate: '2026-09-30' }), 'manual')).toEqual([])
    })
    it('保存の前後で「二重に戻る」を実測と合わせる（注記を出す条件＝保存すると発生が2件になる条件）', () => {
      const events = [stored(), standalone()]
      const changed = form({ mkPeriods: [3, 4] })
      const saved = buildClassEventFromForm(
        { ...changed, editId: 'c1', type: 'cancel', periods: [3], room: '', note: '', countdown: EMPTY_COUNTDOWN_FORM },
        new Date(2026, 8, 1),
      )
      expect(ids(makeupFormNotices(events, 'c1', changed, 'manual'))).toEqual(['s1'])
      // 保存すると s1 は覆われなくなる＝単独の補講として再び現れる（注記が予告している挙動そのもの）
      expect(coveredStandaloneMakeups([saved, standalone()]).has('s1')).toBe(false)
      // 注記を出さない値なら、保存しても覆われたまま
      const same = buildClassEventFromForm(
        { ...form(), editId: 'c1', type: 'cancel', periods: [3], room: '', note: '', countdown: EMPTY_COUNTDOWN_FORM },
        new Date(2026, 8, 1),
      )
      expect(makeupFormNotices(events, 'c1', form(), 'manual')).toEqual([])
      expect(coveredStandaloneMakeups([same, standalone()]).has('s1')).toBe(true)
    })
  })
})

describe('実採取の掲示: 選んで保存した休講を、シリアライズを通さず開き直して日程を変えると注記が出る', () => {
  function itemFromHtml(id: string, category: string, title: string, html: string): BulletinItem {
    return { id, category, title, date: '2026/09/01', meta: '', unread: false, flagged: false, important: false, body: parseBulletinDetail(html) }
  }
  const X0 = itemFromHtml('b-cancel', '休講', '【休講】…図学・製図', DETAIL_CANCEL_MAKEUP.replace(/<br>補講日：[^<]*/, ''))
  const Y = itemFromHtml('b-makeup', '補講', '【補講】…図学・製図', DETAIL_MAKEUP)
  const tapAdd = (events: ClassEvent[], item: BulletinItem): ClassEvent[] => {
    const next = [...events]
    for (const v of reconcileCandidates(parseBulletinEvents(item), events)) {
      if (v.state === 'new') next.push(candidateToClassEvent(v.candidate, v.candidate.sourceBulletinId))
    }
    return next
  }

  it('補講未定の休講＋単独補講（選ぶ前）は注記なし。選んで保存 → 日程を変えると注記', () => {
    const before = tapAdd(tapAdd([], X0), Y)
    const c = before.find((e) => e.type === 'cancel')!
    const s = before.find((e) => e.type === 'makeup')!
    const base = { courseName: c.courseName, courseCode: c.courseCode, date: c.date }
    // 選ぶ前: 補講未定で開いた直後。注記は出ない（補講と無関係な状態）
    expect(makeupFormNotices(before, c.id, { ...base, makeupStatus: 'undecided', mkDate: '', mkPeriods: [], mkRoom: '' }, 'pick')).toEqual([])
    // 選んだ直後（フォーム上）: 選択した値＝覆われる → 注記なし
    expect(makeupFormNotices(before, c.id, { ...base, ...makeupFormValues(s) }, 'pick')).toEqual([])
    // 選んで保存した後に開き直し、自分で入力で時限を変える → 注記
    const saved = buildClassEventFromForm(
      { editId: c.id, courseName: c.courseName, courseCode: c.courseCode, type: 'cancel', date: c.date, periods: c.periods, room: '', note: '', ...makeupFormValues(s), countdown: EMPTY_COUNTDOWN_FORM },
      new Date(2026, 8, 1),
    )
    const after = before.map((e) => (e.id === c.id ? saved : e))
    expect(ids(makeupFormNotices(after, c.id, { ...base, ...makeupFormValues(s), mkPeriods: [4] }, 'manual'))).toEqual([s.id])
    expect(makeupFormNotices(after, c.id, { ...base, ...makeupFormValues(s) }, 'pick')).toEqual([])
  })
})

describe('makeupNoticeText: 注記の文言', () => {
  const s = standalone()
  it('補講あり: 日付・時限が一致しないため、別の補講として表示・通知される', () => {
    expect(makeupNoticeText([s], 'has')).toBe(
      '追加済みの補講（9/23(水) 3限）は、この休講の補講と日付・時限が一致しないため、別の補講として表示・通知されます。',
    )
  })
  it('補講なし・未定: この休講の補講から外れるため…', () => {
    expect(makeupNoticeText([s], 'none')).toBe('追加済みの補講（9/23(水) 3限）は、この休講の補講から外れるため、別の補講として表示・通知されます。')
    expect(makeupNoticeText([s], 'undecided')).toContain('この休講の補講から外れるため')
  })
  it('複数なら先頭＋「ほかN件」。空なら空文字', () => {
    const s2 = standalone({ id: 's2', date: '2026-09-30', periods: [4] })
    expect(makeupNoticeText([s, s2], 'has')).toContain('追加済みの補講（9/23(水) 3限ほか1件）')
    expect(makeupNoticeText([], 'has')).toBe('')
  })
})
