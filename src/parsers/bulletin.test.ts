import { describe, it, expect } from 'vitest'
import {
  parseBulletinList,
  toBulletinDigest,
  simplifyCategory,
  shortDate,
} from './bulletin'
import { BULLETIN_LIST_FIXTURE } from './bulletin.fixtures'

describe('parseBulletinList', () => {
  const rows = parseBulletinList(BULLETIN_LIST_FIXTURE)

  it('全 dl.keiji を行として抽出する', () => {
    expect(rows).toHaveLength(4)
  })
  it('カテゴリ・件名・日付を取る', () => {
    expect(rows[0].category).toBe('お知らせ(個人に対する)')
    expect(rows[0].title).toBe('7月6日（月）以降の授業実施方法について（講義棟で授業を行います）')
    expect(rows[0].date).toBe('2026/07/04')
  })
  it('未読はタイトルの fontBold で判定', () => {
    expect(rows[0].unread).toBe(true) // fontBold あり
    expect(rows[1].unread).toBe(false) // 既読
    expect(rows[2].unread).toBe(true)
  })
  it('重要・新着はアイコンの hiddenStyle 有無で判定', () => {
    expect(rows[0].important).toBe(true) // hiddenStyle なし
    expect(rows[0].isNew).toBe(true)
    expect(rows[2].important).toBe(false) // hiddenStyle あり
    expect(rows[2].isNew).toBe(false)
  })
  it('別カテゴリも取れる', () => {
    expect(rows[3].category).toBe('授業に関する')
  })
})

describe('simplifyCategory / shortDate', () => {
  it('括弧補足を落とす', () => {
    expect(simplifyCategory('お知らせ(個人に対する)')).toBe('お知らせ')
    expect(simplifyCategory('授業に関する')).toBe('授業に関する')
  })
  it('日付を M/D に', () => {
    expect(shortDate('2026/07/04')).toBe('7/4')
    expect(shortDate('不明')).toBe('不明')
  })
})

describe('toBulletinDigest', () => {
  const digest = toBulletinDigest(parseBulletinList(BULLETIN_LIST_FIXTURE))

  it('未読のみを残す（既読は除外）', () => {
    expect(digest).toHaveLength(3)
    expect(digest.some((d) => d.title.includes('既読済み'))).toBe(false)
  })
  it('id は日付::件名で安定生成', () => {
    expect(digest[0].id).toBe('2026/07/04::7月6日（月）以降の授業実施方法について（講義棟で授業を行います）')
  })
  it('category は短縮、meta は日付（重要なら付記）', () => {
    expect(digest[0].category).toBe('お知らせ')
    expect(digest[0].meta).toBe('7/4 ・ 重要') // 重要
    expect(digest[1].meta).toBe('7/3') // 重要でない
    expect(digest[2].category).toBe('授業に関する')
  })
})
