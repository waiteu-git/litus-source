import { describe, it, expect } from 'vitest'
import {
  diffNewBulletins,
  buildBulletinNotificationContent,
  capNotifiedIds,
  DEFAULT_BULLETIN_NOTIFY_SETTINGS,
  type BulletinNotifySettings,
} from './bulletinNotify'
import type { BulletinItem } from '../storage/bulletinDigestSerialize'

function item(id: string, over: Partial<BulletinItem> = {}): BulletinItem {
  return {
    id,
    category: 'お知らせ',
    title: `件名${id}`,
    date: '2026/07/12',
    meta: '7/12',
    unread: true,
    flagged: false,
    important: false,
    body: null,
    ...over,
  }
}

const ALL: BulletinNotifySettings = { enabled: true, mode: 'all' }

describe('diffNewBulletins', () => {
  it('prevが空なら初回ガードで常に空（全件新着に見えても通知しない）', () => {
    expect(diffNewBulletins([], [item('a'), item('b')], [], ALL)).toEqual([])
  })

  it('prevに無くnotifiedにも無いidだけを新着として返す', () => {
    const prev = [item('a')]
    const incoming = [item('a'), item('b'), item('c')]
    const got = diffNewBulletins(prev, incoming, [], ALL)
    expect(got.map((i) => i.id)).toEqual(['b', 'c'])
  })

  it('通知済みidは新着から除外する（再流入抑止）', () => {
    const prev = [item('a')]
    const incoming = [item('a'), item('b')]
    expect(diffNewBulletins(prev, incoming, ['b'], ALL)).toEqual([])
  })

  it('enabled:false なら空', () => {
    const prev = [item('a')]
    const incoming = [item('a'), item('b')]
    expect(diffNewBulletins(prev, incoming, [], { enabled: false, mode: 'all' })).toEqual([])
  })

  it("mode:'importantOnly' は important のみ返す", () => {
    const prev = [item('a')]
    const incoming = [item('a'), item('b'), item('c', { important: true })]
    const got = diffNewBulletins(prev, incoming, [], { enabled: true, mode: 'importantOnly' })
    expect(got.map((i) => i.id)).toEqual(['c'])
  })
})

describe('buildBulletinNotificationContent', () => {
  it('単数は件名を本文にする', () => {
    expect(buildBulletinNotificationContent([item('a', { title: '休講のお知らせ' })])).toEqual({
      title: '新着掲示',
      body: '休講のお知らせ',
    })
  })

  it('複数は件数要約＋先頭件名', () => {
    const got = buildBulletinNotificationContent([
      item('a', { title: '休講のお知らせ' }),
      item('b'),
      item('c'),
    ])
    expect(got).toEqual({ title: '新着掲示 3件', body: '休講のお知らせ 他' })
  })

  it('空配列でも例外を投げない', () => {
    expect(buildBulletinNotificationContent([])).toEqual({ title: '新着掲示', body: '' })
  })
})

describe('capNotifiedIds', () => {
  it('後勝ちで重複を畳み最新位置を残す（古い→新しい順）', () => {
    expect(capNotifiedIds(['a', 'b', 'a'], 10)).toEqual(['b', 'a'])
  })

  it('上限超過は古い方から丸める', () => {
    expect(capNotifiedIds(['a', 'b', 'c', 'd'], 2)).toEqual(['c', 'd'])
  })

  it('重複なし・上限内はそのまま', () => {
    expect(capNotifiedIds(['a', 'b'], 10)).toEqual(['a', 'b'])
  })
})

describe('DEFAULT_BULLETIN_NOTIFY_SETTINGS', () => {
  it('既定は有効・全件', () => {
    expect(DEFAULT_BULLETIN_NOTIFY_SETTINGS).toEqual({ enabled: true, mode: 'all' })
  })
})
