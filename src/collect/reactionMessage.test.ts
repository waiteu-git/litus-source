import { describe, expect, it } from 'vitest'
import { parseReactionMessage, reactionSubmitAccepted } from './reactionMessage'

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

describe('reactionSubmitAccepted（再提出の確定点）', () => {
  it('完走・200・サーバ側の失敗なしなら受理', () => {
    expect(reactionSubmitAccepted({ ajaxDone: true, ajaxStatus: 200 })).toBe(true)
  })

  it('statusを観測できていなければ受理しない（旧経路は成功と断定できない）', () => {
    expect(reactionSubmitAccepted({ ajaxDone: true })).toBe(false)
  })

  // PrimeFaces は .always() で oncomplete を呼ぶため、通信断でも ajaxDone は true になる。
  // そのとき status は 0。ここを通すと「届いていない再提出」が成功になる。
  it('通信断・中断（status 0）は受理しない', () => {
    expect(reactionSubmitAccepted({ ajaxDone: true, ajaxStatus: 0 })).toBe(false)
    expect(reactionSubmitAccepted({ ajaxDone: true, ajaxStatus: 0, ajaxError: 'error' })).toBe(false)
  })

  it('onerrorが来ていたら受理しない', () => {
    expect(reactionSubmitAccepted({ ajaxDone: true, ajaxStatus: 200, ajaxError: 'timeout' })).toBe(false)
  })

  it('完走していなければ受理しない', () => {
    expect(reactionSubmitAccepted({ ajaxDone: false, ajaxStatus: 200 })).toBe(false)
    expect(reactionSubmitAccepted({})).toBe(false)
  })

  // ここが本題: 200 でも保存されていないケースを成功にしない。
  it('検証NG（200 + validationFailed）は受理しない', () => {
    expect(reactionSubmitAccepted({ ajaxDone: true, ajaxStatus: 200, ajaxInvalid: true })).toBe(false)
  })

  it('サーバ例外（200 + partial-responseの<error>）は受理しない', () => {
    expect(reactionSubmitAccepted({ ajaxDone: true, ajaxStatus: 200, ajaxServerError: 'ViewExpired' })).toBe(false)
    expect(reactionSubmitAccepted({ ajaxDone: true, ajaxStatus: 200, ajaxServerError: 'server-error' })).toBe(false)
  })

  it('4xx/5xxは受理しない', () => {
    expect(reactionSubmitAccepted({ ajaxDone: true, ajaxStatus: 500 })).toBe(false)
  })
})

describe('parseReactionMessage（サーバ側失敗の取り込み）', () => {
  it('ajaxInvalid / ajaxServerError を拾う', () => {
    const m = parseReactionMessage(
      JSON.stringify({
        type: 'reaction',
        stage: 'fill',
        ok: true,
        ajaxDone: true,
        ajaxStatus: 200,
        ajaxInvalid: true,
        ajaxServerError: 'ViewExpired',
      }),
    )
    expect(m).toMatchObject({ kind: 'fill', ok: true, ajaxInvalid: true, ajaxServerError: 'ViewExpired' })
  })

  it('空文字のサーバ例外は「無し」として落とす', () => {
    const m = parseReactionMessage(
      JSON.stringify({ type: 'reaction', stage: 'fill', ok: true, ajaxDone: true, ajaxServerError: '' }),
    )
    expect(m).toMatchObject({ ajaxServerError: undefined })
  })
})
