import { describe, expect, it } from 'vitest'
import {
  CELEBRATION_COPY,
  CELEBRATION_END_MS,
  CELEBRATION_LINK_URL,
  celebrationState,
  isCelebrationActive,
  isCelebrationRowVisible,
  type CelebrationChoice,
} from './celebration'

/**
 * お祝いデザイン（東京理科大学 硤合憲三名誉教授のノーベル化学賞・2026-10-07 発表）。
 * 設計: docs/design/2026-10-08-celebration-mode.md
 *
 * 要件（本人・2026-10-08）: 設定で元に戻せる／**更新後の初回起動は既定でオン**／期間限定（年内）。
 * 「未選択＝オン」と読むので、更新の検出も「最後に見たビルド」の保存も要らない。
 * **期限（2026-12-31 の終わり）が来たら、明示でオンにした人も含めて全員が通常に戻る**（独立レビュー 2026-10-08:
 * 「明示オンは残る」だと、すでにオンの状態で「オン」を押しただけの人にも期限が効かず、大学サイトへのリンクも
 * 年を越えて残る）。オフを選んだ人は期間内も期限後もオフ。
 */

const JST = (iso: string) => new Date(`${iso}+09:00`)

describe('isCelebrationActive: 未選択とオンは期間内だけ表示、オフは常に非表示、期限後は全員通常', () => {
  // [選択, 時点, 期待]
  const table: Array<[CelebrationChoice, string, boolean, string]> = [
    [null, '2026-10-16T09:00:00', true, '未選択（更新後の初回起動）＝オン'],
    [null, '2026-12-31T23:59:59', true, '未選択・期限の最終秒＝まだオン'],
    [null, '2027-01-01T00:00:00', false, '未選択・期限を過ぎたら通常に戻る'],
    [null, '2027-06-01T00:00:00', false, '未選択・期限後'],
    ['off', '2026-10-16T09:00:00', false, '明示のオフは更新後もオフのまま'],
    ['off', '2026-12-31T23:59:59', false, '明示のオフ・期限内'],
    ['off', '2027-02-01T00:00:00', false, '明示のオフ・期限後'],
    ['on', '2026-10-16T09:00:00', true, '明示のオン（期間内）'],
    ['on', '2026-12-31T23:59:59', true, '明示のオン・期限の最終秒'],
    ['on', '2027-01-01T00:00:00', false, '明示のオンも期限後は通常に戻る（期間限定が全員に効く）'],
    ['on', '2027-06-01T00:00:00', false, '明示のオン・半年後'],
  ]
  it.each(table)('選択=%s 時点=%s → %s（%s）', (choice, at, expected) => {
    expect(isCelebrationActive(choice, JST(at))).toBe(expected)
  })
})

describe('isCelebrationRowVisible: 設定の行は期間内だけ（期限後は何も表示されないので行も出さない）', () => {
  it('期間内は出す（オフの人がオンへ戻せるように）', () => {
    expect(isCelebrationRowVisible(JST('2026-11-01T12:00:00'))).toBe(true)
    expect(isCelebrationRowVisible(JST('2026-12-31T23:59:59'))).toBe(true)
  })
  it('期限後は出さない', () => {
    expect(isCelebrationRowVisible(JST('2027-01-01T00:00:00'))).toBe(false)
    expect(isCelebrationRowVisible(JST('2027-02-01T00:00:00'))).toBe(false)
  })
})

describe('celebrationState: 読み込み前は「出さない」（オフの人に一瞬だけ出ない）', () => {
  const now = JST('2026-10-16T09:00:00')
  it('ready=false なら、選択に関わらず active も rowVisible も false', () => {
    for (const c of [null, 'on', 'off'] as const) {
      expect(celebrationState(false, c, now)).toEqual({ active: false, rowVisible: false })
    }
  })
  it('ready=true なら、active と rowVisible は純粋関数と一致する', () => {
    for (const c of [null, 'on', 'off'] as const) {
      expect(celebrationState(true, c, now)).toEqual({
        active: isCelebrationActive(c, now),
        rowVisible: isCelebrationRowVisible(now),
      })
    }
    expect(celebrationState(true, null, now)).toEqual({ active: true, rowVisible: true })
    expect(celebrationState(true, 'off', now)).toEqual({ active: false, rowVisible: true })
  })
})

describe('期限の定数', () => {
  it('2027-01-01 00:00 JST（＝2026-12-31 の終わりまで）', () => {
    expect(CELEBRATION_END_MS).toBe(Date.parse('2026-12-31T15:00:00Z'))
  })
})

describe('文言の台帳（権利と事実の取り決めを機械で守る）', () => {
  const all = Object.values(CELEBRATION_COPY).join('\n')

  it('大学の公式発表ページへのリンク（https・tus.ac.jp）', () => {
    expect(CELEBRATION_LINK_URL).toMatch(/^https:\/\/www\.tus\.ac\.jp\/today\/archive\/\d{8}_\d+\.html$/)
  })

  it('数の断定（「2人目」等）と、理科大の出身・卒業とする書き方をしない（公式発表に記載が無い／受賞者は東京大学卒）', () => {
    expect(all).not.toMatch(/[0-9２-９一二三四五六七八九〇]人目|二人目|出身|卒業生|同窓|OB|OG|母校/)
  })

  it('メダル・財団・写真・協力を示す語を使わない', () => {
    expect(all).not.toMatch(/メダル|財団|写真|肖像|協力|公認|提携|後援|Nobel Prize|nobelprize/i)
  })

  it('「ノーベル」は、必ず「ノーベル化学賞」という事実の記述の形でだけ出る（名称を機能名・ロゴ風にしない）', () => {
    const rest = all.replace(/ノーベル化学賞/g, '')
    expect(rest).not.toContain('ノーベル')
  })

  it('機能名（設定の見出し）に「ノーベル」も大学名も入れない', () => {
    expect(CELEBRATION_COPY.settingLabel).not.toMatch(/ノーベル|理科大|東京理科/)
  })

  it('リンクの読み上げ名は、画面に出ている文言をそのまま含む（読み上げと表示の食い違いを作らない）', () => {
    expect(CELEBRATION_COPY.cardLinkA11y).toContain(CELEBRATION_COPY.cardLinkLabel)
  })

  it('非公式であることを、カードと設定の説明の両方に書く', () => {
    expect(CELEBRATION_COPY.cardNote).toMatch(/非公式/)
    expect(CELEBRATION_COPY.settingNote).toMatch(/公式アプリではありません/)
  })

  it('「公式」は、「非公式」「公式アプリではありません」「大学の発表ページ」を除いて現れない（公式を装わない）', () => {
    const rest = all.replace(/非公式/g, '').replace(/公式アプリではありません/g, '').replace(/公式発表/g, '')
    expect(rest).not.toContain('公式')
  })

  it('受賞者は氏名と肩書（名誉教授）だけで、読み仮名・年齢・経歴を書かない', () => {
    expect(all).toContain('硤合憲三')
    expect(all).not.toMatch(/そあい|ソアイ|Soai|歳|才|生まれ|大学卒|博士/)
  })
})
