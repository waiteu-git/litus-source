import { describe, expect, it } from 'vitest'
import {
  SUBMIT_DIAG_MAX,
  SUBMIT_MAX_RETRY,
  appendSubmitDiag,
  formatSubmitDiag,
  shouldAutoRetrySubmit,
  toSubmitDiag,
  type SubmitDiag,
} from './submitDiag'
import type { SubmitResult } from './engine'

const base: SubmitResult = { result: '送信しました', ok: false, wrong: false, err: false }
const diag = (at: string): SubmitDiag => ({ at, courseName: null, ok: false, wrong: false, err: false, result: 'x' })

describe('appendSubmitDiag', () => {
  it('新しい順に足す', () => {
    const l = appendSubmitDiag([diag('a')], diag('b'))
    expect(l.map((d) => d.at)).toEqual(['b', 'a'])
  })
  it('上限で古いものを捨てる（無制限に貯めない）', () => {
    let l: SubmitDiag[] = []
    for (let i = 0; i < SUBMIT_DIAG_MAX + 5; i++) l = appendSubmitDiag(l, diag(String(i)))
    expect(l).toHaveLength(SUBMIT_DIAG_MAX)
    expect(l[0].at).toBe(String(SUBMIT_DIAG_MAX + 4)) // 最新が先頭
  })
})

/**
 * 自動再送は「CLASSに到達していない」と確定した時だけ＝二重登録にならないことが根拠。
 * 到達したかもしれないケースで再送すると、二重登録や誤送信のリスクを抱える。
 */
describe('shouldAutoRetrySubmit', () => {
  const ctx = { tries: 0, attended: false, hasCode: true }

  it('ajaxError（届いていないと確定）なら再送する', () => {
    expect(shouldAutoRetrySubmit({ ...ctx, result: { ...base, ajaxError: 'error' } })).toBe(true)
  })
  it('ajaxErrorが無ければ再送しない（到達したかもしれない＝二重登録を避ける）', () => {
    expect(shouldAutoRetrySubmit({ ...ctx, result: base })).toBe(false)
    expect(shouldAutoRetrySubmit({ ...ctx, result: { ...base, ajaxFired: true, ajaxDone: false } })).toBe(false)
  })
  it('成功・コード誤りは再送しない', () => {
    expect(shouldAutoRetrySubmit({ ...ctx, result: { ...base, ok: true, ajaxError: 'error' } })).toBe(false)
    expect(shouldAutoRetrySubmit({ ...ctx, result: { ...base, wrong: true, ajaxError: 'error' } })).toBe(false)
  })
  it('出席済みなら再送しない', () => {
    expect(shouldAutoRetrySubmit({ ...ctx, attended: true, result: { ...base, ajaxError: 'error' } })).toBe(false)
  })
  it('コードを保持していなければ再送しない', () => {
    expect(shouldAutoRetrySubmit({ ...ctx, hasCode: false, result: { ...base, ajaxError: 'error' } })).toBe(false)
  })
  it('上限を超えたら再送しない（何度も撃たない）', () => {
    expect(shouldAutoRetrySubmit({ ...ctx, tries: SUBMIT_MAX_RETRY, result: { ...base, ajaxError: 'error' } })).toBe(false)
  })
})

describe('toSubmitDiag / formatSubmitDiag', () => {
  it('診断値を保持し、コードそのものは持たない', () => {
    const d = toSubmitDiag(
      { ...base, btnFound: true, method: 'onclick', filled: 4, ajaxFired: true, ajaxDone: false, ajaxError: 'error', hint: '認証コードを入力してください' },
      { nowIso: '2026-07-16T10:00:00.000Z', courseName: '線形代数学１', note: '自動再送' },
    )
    expect(d.courseName).toBe('線形代数学１')
    expect(d.note).toBe('自動再送')
    expect(d.ajaxError).toBe('error')
    expect(JSON.stringify(d)).not.toContain('1234')
  })
  it('人が読める形に整形する', () => {
    const s = formatSubmitDiag(
      toSubmitDiag({ ...base, btnFound: true, method: 'onclick', ajaxFired: true, ajaxDone: true, ajaxStatus: 200 }, {
        nowIso: '2026-07-16T10:00:00.000Z',
        courseName: '法学',
      }),
    )
    expect(s).toContain('法学')
    expect(s).toContain('status=200')
    expect(s).toContain('method=onclick')
  })
})
