import { describe, it, expect } from 'vitest'
import { parseBulletinDetail } from './bulletinDetail'
import { BULLETIN_DETAIL_FIXTURE } from './__fixtures__/loadDetail'

describe('parseBulletinDetail', () => {
  const b = parseBulletinDetail(BULLETIN_DETAIL_FIXTURE)!
  it('差出人・カテゴリ・件名を取る', () => {
    expect(b.from).toBe('野田統括課 藤井')
    expect(b.category).toBe('お知らせ(個人に対する)')
    expect(b.subject).toContain('野田キャンパス各店舗営業予定')
  })
  it('本文は<br>を改行に、&nbsp;を空白に', () => {
    expect(b.text).toContain('【追記】\n一部営業します。')
    expect(b.text).toContain('関係各位')
    expect(b.text).not.toContain('<br>')
  })
  it('掲示期間を連結', () => {
    expect(b.period).toContain('2026/07/09')
    expect(b.period).toContain('2027/03/31')
  })
  it('添付ボタンを検知', () => expect(b.hasAttachment).toBe(true))
  it('テーブルが無ければ null', () => expect(parseBulletinDetail('<div></div>')).toBeNull())
})
