import { describe, it, expect } from 'vitest'
import { toReactionDiag, reactionFailLabel } from './reactionDiag'
import { formatSubmitDiag } from './submitDiag'

const ctx = { nowIso: '2026-07-20T04:56:42.060Z', courseName: '法学１ （月３）' }

describe('toReactionDiag', () => {
  it('成功を記録する（ajax観測つき）', () => {
    const d = toReactionDiag(
      { outcome: 'ok', required: true, resubmit: false, length: 320, ajaxDone: true, ajaxStatus: 200 },
      ctx,
    )
    expect(d.kind).toBe('reaction')
    expect(d.ok).toBe(true)
    expect(d.filled).toBe(320)
    expect(d.ajaxDone).toBe(true)
    expect(d.ajaxStatus).toBe(200)
  })

  it('本文そのものは記録しない（文字数だけ）', () => {
    const d = toReactionDiag({ outcome: 'ok', required: true, resubmit: false, length: 320 }, ctx)
    expect(JSON.stringify(d)).not.toContain('本文')
    expect(d.filled).toBe(320)
  })

  describe('失敗理由を区別して残す（v98では3種の文言に畳まれて消えていた）', () => {
    const cases = [
      ['form-missing', '提出フォームが見つからない'],
      ['verify-failed', '本文の流し込みを確認できない'],
      ['button-missing', '提出ボタンが見つからない'],
      ['stub', 'このビルドでは提出できない'],
      ['error', '提出画面でエラー'],
      ['open-failed', 'リアペ画面を開けない'],
      ['unconfirmed', '提出したが結果を確認できない'],
    ] as const

    for (const [outcome, label] of cases) {
      it(`${outcome} を記録し、理由が読み取れる`, () => {
        const d = toReactionDiag({ outcome, required: true, resubmit: false, length: 100 }, ctx)
        expect(d.ok).toBe(false)
        expect(d.result).toContain(label)
        expect(reactionFailLabel(outcome)).toBe(label)
      })
    }

    it('別々の失敗が同じ文面に畳まれない（切り分け可能であること）', () => {
      const results = (['form-missing', 'verify-failed', 'button-missing', 'error'] as const).map(
        (o) => toReactionDiag({ outcome: o, required: true, resubmit: false, length: 10 }, ctx).result,
      )
      expect(new Set(results).size).toBe(4)
    })
  })

  it('必須／任意・初回／再提出を区別して残す（原因の切り分けに要る）', () => {
    const req = toReactionDiag({ outcome: 'ok', required: true, resubmit: false, length: 10 }, ctx)
    const opt = toReactionDiag({ outcome: 'ok', required: false, resubmit: true, length: 10 }, ctx)
    expect(req.note).toContain('必須')
    expect(opt.note).toContain('任意')
    expect(opt.note).toContain('再提出')
  })

  it('ajaxError（CLASSに届いていない）を残す', () => {
    const d = toReactionDiag(
      { outcome: 'unconfirmed', required: true, resubmit: false, length: 10, ajaxError: 'timeout' },
      ctx,
    )
    expect(d.ajaxError).toBe('timeout')
  })
})

describe('formatSubmitDiag はリアペの記録も読める形で出す', () => {
  it('出席送信と区別できる見出しになる', () => {
    const d = toReactionDiag({ outcome: 'button-missing', required: true, resubmit: false, length: 250 }, ctx)
    const s = formatSubmitDiag(d)
    expect(s).toContain('リアペ')
    expect(s).toContain('法学１ （月３）')
    expect(s).toContain('提出ボタンが見つからない')
  })

  it('出席送信の記録は従来どおりの表示のまま（後方互換）', () => {
    const s = formatSubmitDiag({
      at: '2026-07-19T23:53:44.799Z',
      courseName: '確率統計1',
      ok: true,
      wrong: false,
      err: false,
      result: '出席登録しました',
      btnFound: true,
      method: 'onclick',
      filled: 4,
      ajaxFired: true,
      ajaxDone: true,
      ajaxStatus: 200,
    })
    expect(s).toContain('OK: 出席登録しました')
    expect(s).not.toContain('リアペ')
  })
})

// 200 で返るサーバ側の失敗を診断へ通すこと（レビュー指摘: 伝播テストが無かった）。
describe('リアペ診断もサーバ側の失敗を落とさない', () => {
  it('ajaxInvalid / ajaxServerError を SubmitDiag へ運ぶ', () => {
    const d = toReactionDiag(
      {
        outcome: 'unconfirmed',
        required: false,
        resubmit: true,
        length: 120,
        ajaxDone: true,
        ajaxStatus: 200,
        ajaxInvalid: true,
        ajaxServerError: 'ViewExpired',
      },
      ctx,
    )
    expect(d).toMatchObject({ ajaxInvalid: true, ajaxServerError: 'ViewExpired' })
    const s = formatSubmitDiag(d)
    expect(s).toContain('検証NG')
    expect(s).toContain('サーバ例外=ViewExpired')
    expect(s).toContain('（任意・再提出）')
    // 本文そのものは残さない（長さのみ）。
    expect(s).toContain('本文=120文字')
  })
})
