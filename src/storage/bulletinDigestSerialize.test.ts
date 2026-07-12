import { describe, it, expect } from 'vitest'
import {
  serializeBulletinDigest,
  deserializeBulletinDigest,
  mergeBulletinItems,
  setItemBody,
  markItemRead,
  setItemFlag,
  type BulletinItem,
} from './bulletinDigestSerialize'
import { parseBulletinList, toBulletinItems } from '../parsers/bulletin'
import { BULLETIN_TABS_FIXTURE } from '../parsers/__fixtures__/loadTabs'

const rows = parseBulletinList(BULLETIN_TABS_FIXTURE)

describe('toBulletinItems', () => {
  const items = toBulletinItems(rows)
  it('全行を BulletinItem に（未読・フラグ含む）', () => {
    expect(items).toHaveLength(2)
    expect(items[0].unread).toBe(true)
    expect(items[1].flagged).toBe(true)
    expect(items[0].body).toBeNull()
  })
  it('id は日付::件名', () => {
    expect(items[0].id).toBe('2026/07/09::未読でフラグなしの掲示')
  })
})

describe('merge / 更新', () => {
  const items = toBulletinItems(rows)
  it('mergeは同一idの状態を統合しbodyキャッシュを保持', () => {
    const withBody = setItemBody(items, items[0].id, {
      from: 'x',
      category: 'y',
      subject: 'z',
      text: '本文',
      period: 'p',
      hasAttachment: false,
    })
    const merged = mergeBulletinItems(withBody, [{ ...items[0], unread: false }])
    const it0 = merged.find((i) => i.id === items[0].id)!
    expect(it0.unread).toBe(false) // 新しい状態
    expect(it0.body?.text).toBe('本文') // 旧bodyキャッシュ保持
  })
  it('incomingを権威とし、含まれない項目は落とす（CLASS側と一致）', () => {
    const merged = mergeBulletinItems(items, [items[0]]) // items[1]は含めない
    expect(merged.some((i) => i.id === items[1].id)).toBe(false)
    expect(merged).toHaveLength(1)
  })
  it('incoming内の同一id（未読かつフラグ付き）はOR統合して1件に畳む', () => {
    const base = items[0]
    const asUnread = { ...base, unread: true, flagged: false }
    const asFlagged = { ...base, unread: false, flagged: true }
    const merged = mergeBulletinItems([], [asUnread, asFlagged])
    expect(merged).toHaveLength(1)
    expect(merged[0].unread).toBe(true)
    expect(merged[0].flagged).toBe(true)
  })
  it('markItemRead は unread=false', () => {
    expect(markItemRead(items, items[0].id).find((i) => i.id === items[0].id)!.unread).toBe(false)
  })
  it('setItemFlag は flagged 更新', () => {
    expect(setItemFlag(items, items[0].id, true).find((i) => i.id === items[0].id)!.flagged).toBe(true)
  })
})

describe('serialize v2', () => {
  it('往復で保持', () => {
    const items = toBulletinItems(rows)
    expect(deserializeBulletinDigest(serializeBulletinDigest(items))).toHaveLength(2)
  })
  it('旧v1(bodyなし)も読める', () => {
    const v1 = JSON.stringify([{ id: 'a', category: 'c', title: 't', meta: 'm' }])
    const got = deserializeBulletinDigest(v1)
    expect(got[0].id).toBe('a')
    expect(got[0].unread).toBe(true) // 旧データは未読扱い
    expect(got[0].body).toBeNull()
  })
})

describe('mergeBulletinItems 保持ルール（now 引数）', () => {
  const body = (category: string, text: string, period = '') => ({ from: '', category, subject: '', text, period, hasAttachment: false })
  const schedItem = (id: string, category: string, text: string, period = ''): BulletinItem => ({
    id, category, title: 't', date: '2026/06/24', meta: '', unread: false, flagged: false, important: false, body: body(category, text, period),
  })

  it('now 省略時は現行挙動（incoming に無い prev は落ちる）', () => {
    const prev = [schedItem('s1', '休講', '休講日：2026/12/01(火) 3限')]
    expect(mergeBulletinItems(prev, [])).toHaveLength(0)
  })

  it('スケジュール系・保持期限未到来は既読でも残る', () => {
    const prev = [schedItem('s1', '休講', '休講日：2026/12/01(火) 3限')]
    const got = mergeBulletinItems(prev, [], new Date('2026-06-24T00:00:00+09:00'))
    expect(got.map((i) => i.id)).toEqual(['s1'])
  })

  it('保持期限超過（授業日が過去）で落ちる', () => {
    const prev = [schedItem('s1', '休講', '休講日：2026/05/01(金) 3限')]
    expect(mergeBulletinItems(prev, [], new Date('2026-06-24T00:00:00+09:00'))).toHaveLength(0)
  })

  it('候補日が読めない場合は掲示期間の終了日で判定', () => {
    const prev = [schedItem('s1', '教室変更', '変更期間：前期', '2026/04/16(木) 06:12～2026/09/23(水) 23:59')]
    const got = mergeBulletinItems(prev, [], new Date('2026-06-24T00:00:00+09:00'))
    expect(got.map((i) => i.id)).toEqual(['s1'])
  })

  it('非スケジュール系は保持しない', () => {
    const prev = [schedItem('s1', 'お知らせ', '本文', '2026/04/16(木)～2026/12/31(火) 23:59')]
    expect(mergeBulletinItems(prev, [], new Date('2026-06-24T00:00:00+09:00'))).toHaveLength(0)
  })
})
