import { describe, expect, it } from 'vitest'
import { parseReactionMessage } from './reactionMessage'

const msg = (o: Record<string, unknown>) => JSON.stringify({ type: 'reaction', ...o })

describe('parseReactionMessage（リアペ提出フローの注入JS応答）', () => {
  it('open成功/失敗', () => {
    expect(parseReactionMessage(msg({ stage: 'open', ok: true }))).toEqual({ kind: 'open', ok: true })
    expect(parseReactionMessage(msg({ stage: 'open', ok: false }))).toEqual({ kind: 'open', ok: false })
  })

  it('fill成功', () => {
    expect(parseReactionMessage(msg({ stage: 'fill', ok: true }))).toEqual({ kind: 'fill', ok: true, reason: null })
  })

  it('fill失敗は既知のreasonを通す', () => {
    for (const reason of ['form-missing', 'verify-failed', 'button-missing', 'stub'] as const) {
      expect(parseReactionMessage(msg({ stage: 'fill', ok: false, reason }))).toEqual({
        kind: 'fill',
        ok: false,
        reason,
      })
    }
  })

  it('fill失敗で未知/欠落のreasonは error に正規化', () => {
    expect(parseReactionMessage(msg({ stage: 'fill', ok: false, reason: 'weird' }))).toEqual({
      kind: 'fill',
      ok: false,
      reason: 'error',
    })
    expect(parseReactionMessage(msg({ stage: 'fill', ok: false }))).toEqual({ kind: 'fill', ok: false, reason: 'error' })
  })

  it('reaction以外のメッセージ・壊れたJSON・未知stageは null', () => {
    expect(parseReactionMessage(JSON.stringify({ type: 'attendance' }))).toBeNull()
    expect(parseReactionMessage('not-json')).toBeNull()
    expect(parseReactionMessage('null')).toBeNull()
    expect(parseReactionMessage(msg({ stage: 'unknown' }))).toBeNull()
  })
})
