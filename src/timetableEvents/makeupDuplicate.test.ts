import { describe, expect, it } from 'vitest'
import { parseBulletinDetail } from '../parsers/bulletinDetail'
import { DETAIL_CANCEL_MAKEUP, DETAIL_MAKEUP } from '../parsers/__fixtures__/loadEventDetails'
import type { BulletinItem } from '../storage/bulletinDigestSerialize'
import { candidateToClassEvent, parseBulletinEvents, reconcileCandidates } from './bulletinEvents'
import type { ClassEvent } from './classEvent'
import { makeupOccurrences } from './classEvent'
import { buildClassEventNotifications } from './eventSchedule'
import { todaySchedule, upcomingMakeups } from './eventSelectors'

/**
 * 補講の二重登録（2026-09-29 の本人報告・設計 docs/design/2026-09-29-makeup-duplicate-and-candidate-fold.md）。
 *
 * 実採取の掲示2通（同科目・同じ補講 2026/09/23 3限）:
 *   X＝【休講＆補講】＝休講 10/21 に補講 9/23 を内包（候補の種別は cancel）
 *   Y＝【補講】＝単独の補講 9/23（候補の種別は makeup）
 * 突合が種別の一致を要求するため、どちらの順で追加しても別々に登録され、補講の発生と通知が二重になっていた
 * （修正前の実測＝補講の発生2件・予約される通知5件）。
 *
 * ここでは**追加ボタンと同じ経路**（reconcile が new の時だけ candidateToClassEvent を末尾追加）を再現する。
 * NOW を固定する: 補講日が過去だと前夜・当日の通知が除外され、「1組以下」のような緩い期待が空振りで通ってしまうため。
 */

const NOW = new Date(2026, 8, 1, 12, 0)

function itemFromHtml(id: string, category: string, title: string, html: string): BulletinItem {
  const body = parseBulletinDetail(html)
  return { id, category, title, date: '2026/09/01', meta: '', unread: false, flagged: false, important: false, body }
}

const X = itemFromHtml('b-cancel-makeup', '休講', '【休講＆補講】…図学・製図', DETAIL_CANCEL_MAKEUP)
const Y = itemFromHtml('b-makeup', '補講', '【補講】…図学・製図', DETAIL_MAKEUP)
const candX = parseBulletinEvents(X)[0]
const candY = parseBulletinEvents(Y)[0]

/** 追加ボタンの経路: 候補を全て reconcile し、new のものだけ保存する。 */
function tapAdd(events: ClassEvent[], item: BulletinItem): ClassEvent[] {
  const views = reconcileCandidates(parseBulletinEvents(item), events)
  const next = [...events]
  for (const v of views) if (v.state === 'new') next.push(candidateToClassEvent(v.candidate, v.candidate.sourceBulletinId))
  return next
}

/** 二重だった時の保存データ（221 までに保存済みの端末）: 掲示の状態を見ずに両方を保存した並び。 */
function storedPair(order: 'XY' | 'YX'): ClassEvent[] {
  const c = candidateToClassEvent(candX, candX.sourceBulletinId)
  const s = candidateToClassEvent(candY, candY.sourceBulletinId)
  return order === 'XY' ? [c, s] : [s, c]
}

const ORDERS: [string, ClassEvent[]][] = [
  ['【休講＆補講】を先に追加 → 【補講】', tapAdd(tapAdd([], X), Y)],
  ['【補講】を先に追加 → 【休講＆補講】', tapAdd(tapAdd([], Y), X)],
  ['221までに保存済みの二重（休講＆補講, 補講の順）', storedPair('XY')],
  ['221までに保存済みの二重（補講, 休講＆補講の順）', storedPair('YX')],
]

const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h, 0).getTime()

describe('実採取の掲示2通: 補講は1件・通知は1組にまとまる', () => {
  for (const [label, events] of ORDERS) {
    describe(label, () => {
      it('補講の発生は1件（9/23・3限）', () => {
        const occ = makeupOccurrences(events)
        expect(occ).toHaveLength(1)
        expect(occ[0]).toMatchObject({ date: '2026-09-23', periods: [3], courseName: '図学・製図' })
      })

      it('通知は3件（休講当日 10/21 08:00 ＋ 補講の前夜 9/22 20:00 と当日 9/23 08:00）', () => {
        const n = buildClassEventNotifications(events, NOW)
        expect(n.map((x) => x.fireAt.getTime()).sort()).toEqual(
          [at(2026, 9, 22, 20), at(2026, 9, 23, 8), at(2026, 10, 21, 8)].sort(),
        )
      })

      it('時間割の補講行（upcomingMakeups）とホームの今日の変更（todaySchedule）も1件', () => {
        expect(upcomingMakeups(events, NOW)).toHaveLength(1)
        const day = new Date(2026, 8, 23, 9, 0)
        expect(todaySchedule(events, day).filter((i) => i.kind === 'makeup')).toHaveLength(1)
      })

      it('両方の掲示の候補が「追加済み」で、matchedEventId は補講を内包した休講になる（追加ボタンは押せない）', () => {
        const cancel = events.find((e) => e.type === 'cancel')
        expect(cancel).toBeDefined()
        const views = reconcileCandidates([candX, candY], events)
        expect(views.map((v) => v.state)).toEqual(['added', 'added'])
        expect(views.map((v) => v.matchedEventId)).toEqual([cancel!.id, cancel!.id])
      })
    })
  }

  it('休講を消すと単独補講が再び現れ、通知は単独側の前夜・当日に戻る（データは保たれている）', () => {
    const events = storedPair('YX').filter((e) => e.type !== 'cancel')
    expect(makeupOccurrences(events)).toHaveLength(1)
    const n = buildClassEventNotifications(events, NOW)
    expect(n.map((x) => x.fireAt.getTime()).sort()).toEqual([at(2026, 9, 22, 20), at(2026, 9, 23, 8)].sort())
  })

  it('休講のみ登録済み（補講未定）→ 【補講】を単独登録 → 【休講＆補講】の補講追記でも補講は1件', () => {
    const cancelOnly: ClassEvent = {
      ...candidateToClassEvent(candX, candX.sourceBulletinId),
      makeupStatus: 'undecided',
      makeup: null,
    }
    const standalone = candidateToClassEvent(candY, candY.sourceBulletinId)
    const views = reconcileCandidates([candX], [cancelOnly, standalone])
    expect(views[0].state).toBe('makeupAppend')
    const appended = { ...cancelOnly, makeupStatus: 'has' as const, makeup: candX.makeup }
    const events = [appended, standalone]
    expect(makeupOccurrences(events)).toHaveLength(1)
    expect(buildClassEventNotifications(events, NOW)).toHaveLength(3)
  })
})
