import { test, expect } from 'vitest'
import { courseUnreadCounts } from './courseUnread'
import type { BulletinItem } from '../storage/bulletinDigestSerialize'

function item(id: string, title: string, unread: boolean): BulletinItem {
  return { id, category: '授業に関する', title, date: '2026/07/01', meta: '', unread, flagged: false, important: false, body: null }
}

test('未読かつ履修コード一致を科目別に数える', () => {
  const digest = [
    item('a', '【休講】… 9960700 ドイツ語Ａ', true),
    item('b', '小テストのお知らせ 9960700 ドイツ語Ａ', true),
    item('c', '既読の掲示 9960700', false),
    item('d', '履修外 9999999', true),
  ]
  const m = courseUnreadCounts(digest, new Set(['9960700']))
  expect(m.get('9960700')).toBe(2)
  expect(m.has('9999999')).toBe(false)
})

test('該当なしは空Map', () => {
  const m = courseUnreadCounts([item('a', 'コードなし掲示', true)], new Set(['9960700']))
  expect(m.size).toBe(0)
})

test('1掲示に同一コードが複数出ても1カウント', () => {
  const m = courseUnreadCounts([item('a', '9960700 と 9960700 の再掲', true)], new Set(['9960700']))
  expect(m.get('9960700')).toBe(1)
})
