import { test, expect } from 'vitest'
import { type BulletinEventCandidate, parseBulletinEvents, reconcileCandidates, candidateToClassEvent, countScheduleNotices, formatScheduleNoticeLabel, findSingleScheduleNotice, type ScheduleNoticeCounts } from './bulletinEvents'
import { parseBulletinDetail } from '../parsers/bulletinDetail'
import type { BulletinItem } from '../storage/bulletinDigestSerialize'
import type { ClassEvent } from './classEvent'
import {
  DETAIL_CANCEL_MAKEUP,
  DETAIL_MAKEUP,
  DETAIL_ROOMCHANGE,
} from '../parsers/__fixtures__/loadEventDetails'

function itemFromHtml(id: string, category: string, title: string, html: string): BulletinItem {
  const body = parseBulletinDetail(html)
  return { id, category, title, date: '2026/06/24', meta: '', unread: false, flagged: false, important: false, body }
}

const CANCEL = itemFromHtml('b-cancel', '休講', '【休講＆補講】…図学・製図', DETAIL_CANCEL_MAKEUP)
const MAKEUP = itemFromHtml('b-makeup', '補講', '【補講】…図学・製図', DETAIL_MAKEUP)
const ROOM = itemFromHtml('b-room', '教室変更', '【教室変更】…ドイツ語Ａ', DETAIL_ROOMCHANGE)

test('休講＆補講: cancel＋makeup内包を実bodyから抽出', () => {
  const [c] = parseBulletinEvents(CANCEL)
  expect(c.type).toBe('cancel')
  expect(c.courseCode).toBe('9973415')
  expect(c.courseName).toBe('図学・製図')
  expect(c.date).toBe('2026-10-21')
  expect(c.periods).toEqual([3])
  expect(c.makeup).toEqual({ date: '2026-09-23', periods: [3], room: '1211教室' })
})

test('補講: makeup を実bodyから抽出（教室行あり）', () => {
  const [c] = parseBulletinEvents(MAKEUP)
  expect(c.type).toBe('makeup')
  expect(c.courseCode).toBe('9973415')
  expect(c.date).toBe('2026-09-23')
  expect(c.periods).toEqual([3])
  expect(c.room).toBe('野：1211教室')
  expect(c.makeup).toBeNull()
})

test('教室変更: roomChange を実bodyから抽出（変更後教室）', () => {
  const [c] = parseBulletinEvents(ROOM)
  expect(c.type).toBe('roomChange')
  expect(c.courseCode).toBe('9960700')
  expect(c.date).toBe('2026-04-17')
  expect(c.periods).toEqual([4])
  expect(c.room).toBe('野：Ｋ３１０教室')
})

test('body=null は空配列', () => {
  const it: BulletinItem = { id: 'x', category: '休講', title: '【休講】…', date: '2026/06/24', meta: '', unread: true, flagged: false, important: false, body: null }
  expect(parseBulletinEvents(it)).toEqual([])
})

test('非スケジュール系カテゴリ（body優先）は空配列', () => {
  const body = { from: '', category: 'お知らせ', subject: '', period: '', text: '通常のお知らせ本文', hasAttachment: false }
  const it: BulletinItem = { id: 'y', category: '休講', title: 'お知らせ', date: '2026/06/24', meta: '', unread: true, flagged: false, important: false, body }
  expect(parseBulletinEvents(it)).toEqual([])
})

test('複数コマ（N・M限）を配列化', () => {
  const body = {
    from: '', category: '休講', subject: '', period: '',
    text: '授業名：9973366 電気電子情報工学デザイン\n休講日：2026/11/05(木) 4・5限',
    hasAttachment: false,
  }
  const it: BulletinItem = { id: 'z', category: '休講', title: '', date: '2026/06/24', meta: '', unread: true, flagged: false, important: false, body }
  const [c] = parseBulletinEvents(it)
  expect(c.periods).toEqual([4, 5])
})

test('reconcile: 一致なしはnew、一致はadded', () => {
  const [cand] = parseBulletinEvents(ROOM)
  expect(reconcileCandidates([cand], [])[0].state).toBe('new')
  const added = candidateToClassEvent(cand, cand.sourceBulletinId)
  const view = reconcileCandidates([cand], [added])[0]
  expect(view.state).toBe('added')
  expect(view.matchedEventId).toBe(added.id)
})

test('reconcile: 休講＆補講のcancel部分が既存休講に一致→makeupAppend', () => {
  const [cand] = parseBulletinEvents(CANCEL)
  const existingCancel: ClassEvent = {
    id: 'ec', courseName: '図学・製図', courseCode: '9973415', type: 'cancel',
    date: '2026-10-21', periods: [3], room: null, note: null, createdAt: 't', makeupStatus: 'undecided',
  }
  const view = reconcileCandidates([cand], [existingCancel])[0]
  expect(view.state).toBe('makeupAppend')
  expect(view.matchedEventId).toBe('ec')
})

test('candidateToClassEvent: 休講＆補講→makeupStatus=has＋makeup', () => {
  const [cand] = parseBulletinEvents(CANCEL)
  const ev = candidateToClassEvent(cand, cand.sourceBulletinId)
  expect(ev.type).toBe('cancel')
  expect(ev.makeupStatus).toBe('has')
  expect(ev.makeup).toEqual({ date: '2026-09-23', periods: [3], room: '1211教室' })
  // ID決定論
  expect(candidateToClassEvent(cand, cand.sourceBulletinId).id).toBe(ev.id)
})

test('countScheduleNotices: 未読の休講/補講/教室変更を種別ごとに数える', () => {
  const items = [
    { category: '休講', unread: true },
    { category: '休講', unread: true },
    { category: '補講', unread: true },
    { category: '教室変更', unread: true },
    { category: 'お知らせ', unread: true },
  ]
  expect(countScheduleNotices(items)).toEqual({ cancel: 2, makeup: 1, roomChange: 1 })
})

test('countScheduleNotices: 既読は数えない', () => {
  const items = [
    { category: '休講', unread: false },
    { category: '補講', unread: true },
  ]
  expect(countScheduleNotices(items)).toEqual({ cancel: 0, makeup: 1, roomChange: 0 })
})

test('countScheduleNotices: 該当カテゴリが無ければ全て0', () => {
  const items = [{ category: 'お知らせ', unread: true }]
  expect(countScheduleNotices(items)).toEqual({ cancel: 0, makeup: 0, roomChange: 0 })
})

test('formatScheduleNoticeLabel: 複数種別を「・」で連結する', () => {
  const counts: ScheduleNoticeCounts = { cancel: 1, makeup: 2, roomChange: 0 }
  expect(formatScheduleNoticeLabel(counts)).toBe('休講1件・補講2件のお知らせ')
})

test('formatScheduleNoticeLabel: 0件が混ざる時、その種別だけ文言に出ない', () => {
  const counts: ScheduleNoticeCounts = { cancel: 0, makeup: 0, roomChange: 3 }
  expect(formatScheduleNoticeLabel(counts)).toBe('教室変更3件のお知らせ')
})

test('formatScheduleNoticeLabel: 全て0件はnull', () => {
  expect(formatScheduleNoticeLabel({ cancel: 0, makeup: 0, roomChange: 0 })).toBe(null)
})

test('findSingleScheduleNotice: 未読のスケジュール系掲示がちょうど1件ならそれを返す', () => {
  const items = [
    { category: '休講', unread: true, id: 'a' },
    { category: 'お知らせ', unread: true, id: 'b' },
  ]
  expect(findSingleScheduleNotice(items)).toEqual({ category: '休講', unread: true, id: 'a' })
})

test('findSingleScheduleNotice: 0件はnull', () => {
  const items = [{ category: 'お知らせ', unread: true, id: 'a' }]
  expect(findSingleScheduleNotice(items)).toBe(null)
})

test('findSingleScheduleNotice: 2件以上はnull', () => {
  const items = [
    { category: '休講', unread: true, id: 'a' },
    { category: '補講', unread: true, id: 'b' },
  ]
  expect(findSingleScheduleNotice(items)).toBe(null)
})

test('findSingleScheduleNotice: 既読は数えない', () => {
  const items = [
    { category: '休講', unread: false, id: 'a' },
    { category: '休講', unread: true, id: 'b' },
  ]
  expect(findSingleScheduleNotice(items)).toEqual({ category: '休講', unread: true, id: 'b' })
})
