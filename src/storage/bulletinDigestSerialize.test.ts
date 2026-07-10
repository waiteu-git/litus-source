import { describe, it, expect } from 'vitest'
import {
  serializeBulletinDigest,
  deserializeBulletinDigest,
  mergeBulletinItems,
  setItemBody,
  markItemRead,
  setItemFlag,
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
  it('incomingに無いフラグ付きは残す', () => {
    const merged = mergeBulletinItems(items, [items[0]]) // items[1](flagged)は含めない
    expect(merged.some((i) => i.id === items[1].id)).toBe(true)
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
