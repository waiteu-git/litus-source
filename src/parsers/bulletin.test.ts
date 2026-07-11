import { describe, it, expect } from 'vitest'
import {
  parseBulletinList,
  toBulletinDigest,
  simplifyCategory,
  shortDate,
} from './bulletin'
import { BULLETIN_LIST_FIXTURE } from './bulletin.fixtures'
import { BULLETIN_TABS_FIXTURE } from './__fixtures__/loadTabs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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

describe('parseBulletinList: flagged 判定', () => {
  const rows = parseBulletinList(BULLETIN_TABS_FIXTURE)
  it('2行を抽出', () => expect(rows).toHaveLength(2))
  it('フラグボタン「フラグをはずす」でflagged=true', () => {
    expect(rows[0].flagged).toBe(false) // 「フラグをつける」
    expect(rows[1].flagged).toBe(true) // 「フラグをはずす」
  })
  it('未読はfontBold', () => {
    expect(rows[0].unread).toBe(true)
    expect(rows[1].unread).toBe(false)
  })
  it('ボタンの無い旧フィクスチャはflagged=false', () => {
    const old = parseBulletinList(BULLETIN_LIST_FIXTURE)
    expect(old.every((r) => r.flagged === false)).toBe(true)
  })
})

// 回帰: 重要掲示は既読でも件名の fontBold が残ることがあり、fontBold だけで未読判定すると
// 「CLASS上は既読なのにアプリが未読と誤判定→毎回再取得」される。状態ボタン文言（未読にする=既読 /
// 既読にする=未読）はCLASSの既読トグルそのものなので、ボタンがある行はそれを正とする。
describe('parseBulletinList: 既読トグル文言を未読判定の正とする（重要掲示のfontBold残り対策）', () => {
  const readImportant = `
    <div class="alignRight">
      <dl class="keiji">
        <span class="keijiCategory">お知らせ</span>
        <i class="fa fa-exclamation-circle"></i>
        <a class="ui-commandlink fontBold">重要な既読の掲示</a> 2026/07/06
      </dl>
      <span class="inlineBlock">
        <button class="btnRead"><span class="ui-button-text">フラグをつける</span></button>
        <button class="btnRead"><span class="ui-button-text">未読にする</span></button>
      </span>
    </div>`
  it('ボタンが「未読にする」なら既読（fontBoldでも unread=false）', () => {
    const rows = parseBulletinList(readImportant)
    expect(rows).toHaveLength(1)
    expect(rows[0].important).toBe(true)
    expect(rows[0].unread).toBe(false)
  })
  it('ボタンが「既読にする」なら未読', () => {
    const unreadRow = readImportant.replace('未読にする', '既読にする')
    expect(parseBulletinList(unreadRow)[0].unread).toBe(true)
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

// 実DOM回帰: CLASS掲示ページ(Bsa00101.xhtml 2026-07-10実測)の実際の dl.keiji 抜粋。
// セレクタ/構造が実サイト変更で壊れていないことを担保する（合成フィクスチャでは気づけない差分対策）。
describe('parseBulletinList（実DOMフィクスチャ）', () => {
  const html = readFileSync(fileURLToPath(new URL('./__fixtures__/bulletin-real.html', import.meta.url)), 'utf-8')
  const rows = parseBulletinList(html)

  it('実ページの dl.keiji を全行抽出（抜粋6行）', () => {
    expect(rows).toHaveLength(6)
  })
  it('未読(fontBold)を正しく判定', () => {
    expect(rows.filter((r) => r.unread)).toHaveLength(3)
  })
  it('新着アイコン(hiddenStyleなし)で isNew', () => {
    const konyo = rows.find((r) => r.title.includes('こうよう会'))
    expect(konyo?.isNew).toBe(true)
    expect(konyo?.unread).toBe(true)
  })
  it('重要アイコン(hiddenStyleなし)で important', () => {
    const jugyo = rows.filter((r) => r.title.includes('授業実施方法'))
    expect(jugyo.length).toBeGreaterThan(0)
    expect(jugyo.every((r) => r.important)).toBe(true)
  })
  it('カテゴリ・日付を実DOMから取得', () => {
    expect(rows[0].category).toBe('お知らせ(個人に対する)')
    expect(rows[0].date).toBe('2026/07/03')
  })
  it('ダイジェストは未読3件', () => {
    expect(toBulletinDigest(rows)).toHaveLength(3)
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
