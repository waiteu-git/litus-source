import { describe, expect, it } from 'vitest'
import {
  REACTION_MAX_LEN,
  reactionLength,
  canSubmitReaction,
  reactionDraftApplies,
  type ReactionDraft,
} from './reactionPaper'

describe('reactionLength（CLASS実測: 600文字以内・全角は2文字換算）', () => {
  it('半角ASCIIは1文字、全角は2文字で数える', () => {
    expect(reactionLength('abc')).toBe(3)
    expect(reactionLength('あいう')).toBe(6)
    expect(reactionLength('a あ')).toBe(4) // 半角1+半角スペース1+全角2
  })

  it('空文字は0、改行（半角）は1', () => {
    expect(reactionLength('')).toBe(0)
    expect(reactionLength('a\nb')).toBe(3)
  })

  it('半角カナ・絵文字など非ASCIIは安全側の2文字換算（サーバ換算が未確定のため）', () => {
    expect(reactionLength('ｱ')).toBe(2)
    expect(reactionLength('😀')).toBe(2) // サロゲートペアでも1コードポイント=2
  })

  it('全角300文字でちょうど上限600', () => {
    expect(reactionLength('あ'.repeat(300))).toBe(REACTION_MAX_LEN)
  })
})

describe('canSubmitReaction', () => {
  it('空・空白のみは提出不可', () => {
    expect(canSubmitReaction('')).toBe(false)
    expect(canSubmitReaction('   \n ')).toBe(false)
  })

  it('上限以内の本文は提出可、上限超過は不可', () => {
    expect(canSubmitReaction('本日の講義の感想です。')).toBe(true)
    expect(canSubmitReaction('あ'.repeat(300))).toBe(true) // ちょうど600
    expect(canSubmitReaction('あ'.repeat(300) + 'x')).toBe(false) // 601
  })
})

describe('reactionDraftApplies（下書きの復元条件）', () => {
  const draft = (o: Partial<ReactionDraft>): ReactionDraft => ({
    date: '2026-07-13',
    courseName: '法学１',
    text: '下書き本文',
    ...o,
  })

  it('同日・同科目なら適用', () => {
    expect(reactionDraftApplies(draft({}), '2026-07-13', '法学１')).toBe(true)
  })

  it('日付が違えば適用しない（古い下書きを別日に出さない）', () => {
    expect(reactionDraftApplies(draft({}), '2026-07-14', '法学１')).toBe(false)
  })

  it('科目が違えば適用しない（別授業のリアペに誤流用しない）', () => {
    expect(reactionDraftApplies(draft({}), '2026-07-13', '化学1')).toBe(false)
  })

  it('どちらかの科目名が不明（null）なら同日中は適用（安全側=本文を消さない）', () => {
    expect(reactionDraftApplies(draft({ courseName: null }), '2026-07-13', '法学１')).toBe(true)
    expect(reactionDraftApplies(draft({}), '2026-07-13', null)).toBe(true)
  })

  it('本文が空の下書きは適用しない', () => {
    expect(reactionDraftApplies(draft({ text: '' }), '2026-07-13', '法学１')).toBe(false)
  })
})
