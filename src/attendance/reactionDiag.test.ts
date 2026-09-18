import { describe, it, expect } from 'vitest'
import {
  toReactionDiag,
  reactionFailLabel,
  appendReactionTrail,
  formatReactionNote,
  joinReactionNote,
  shouldReconcileFirstSubmit,
  shouldReconcileResubmit,
  REACTION_TRAIL_MAX,
} from './reactionDiag'
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

describe('提出中に通ったページの記録（appendReactionTrail / formatReactionNote）', () => {
  const U1 = 'https://class.admin.tus.ac.jp/uprx/up/xu/xut124/Xut12401.xhtml'
  const U2 = 'https://class.admin.tus.ac.jp/uprx/up/xu/xua001/Xua00102.xhtml?x=1#y'

  it('種別と画面IDだけを残す（クエリ・フラグメントは残さない）', () => {
    const t = appendReactionTrail(appendReactionTrail([], 'attendance', U1), 'portal', U2)
    expect(t).toEqual(['attendance:Xut12401', 'portal:Xua00102'])
    expect(t.join('')).not.toContain('x=1')
  })
  it('画面IDが取れないURL・URL無しは種別だけ', () => {
    expect(appendReactionTrail([], 'login', 'https://login.microsoftonline.com/abc')).toEqual(['login'])
    expect(appendReactionTrail([], 'other')).toEqual(['other'])
  })
  it('同じものが続いたら畳む', () => {
    const t = appendReactionTrail(appendReactionTrail([], 'portal', U2), 'portal', U2)
    expect(t).toEqual(['portal:Xua00102'])
  })
  it('上限を超えたら捨てて「…」を1つだけ付ける', () => {
    let t: string[] = []
    for (let i = 0; i < REACTION_TRAIL_MAX + 5; i++) t = appendReactionTrail(t, i % 2 ? 'portal' : 'attendance', i % 2 ? U2 : U1)
    expect(t).toHaveLength(REACTION_TRAIL_MAX + 1)
    expect(t[t.length - 1]).toBe('…')
  })
  it('元の配列を書き換えない', () => {
    const a = ['attendance:Xut12401']
    appendReactionTrail(a, 'portal', U2)
    expect(a).toEqual(['attendance:Xut12401'])
  })
  it('補足欄: ②待ちと遷移を並べる／どちらも無ければ undefined', () => {
    expect(formatReactionNote(8, ['attendance:Xut12401', 'portal:Xua00102'])).toBe('②待ち8回・遷移=attendance:Xut12401>portal:Xua00102')
    expect(formatReactionNote(0, ['portal:Xua00102'])).toBe('遷移=portal:Xua00102')
    expect(formatReactionNote(3, [])).toBe('②待ち3回')
    expect(formatReactionNote(0, [])).toBeUndefined()
  })
  it('診断の1行へそのまま載る（toReactionDiag の note）', () => {
    const d = toReactionDiag(
      { outcome: 'form-missing', required: true, resubmit: false, length: 13 },
      { ...ctx, note: formatReactionNote(8, ['portal:Xua00102', 'attendance:Xut12401']) },
    )
    expect(d.note).toBe('必須・②待ち8回・遷移=portal:Xua00102>attendance:Xut12401')
  })
})

describe('joinReactionNote', () => {
  it('両方あれば・で結合する', () => {
    expect(joinReactionNote('②待ち2回', '訂正(遅延検知)')).toBe('②待ち2回・訂正(遅延検知)')
  })
  it('baseだけならbaseのみ', () => {
    expect(joinReactionNote('②待ち2回', undefined)).toBe('②待ち2回')
  })
  it('extraだけならextraのみ', () => {
    expect(joinReactionNote(undefined, '訂正(遅延fill)')).toBe('訂正(遅延fill)')
  })
  it('両方無ければundefined', () => {
    expect(joinReactionNote(undefined, undefined)).toBeUndefined()
  })
})

describe('shouldReconcileFirstSubmit', () => {
  const base = { lastFailOutcome: 'unconfirmed' as const, busy: false, required: false, courseNameMatches: true, reactionSubmitted: true }
  it('全条件が揃えば訂正する', () => {
    expect(shouldReconcileFirstSubmit(base)).toBe(true)
  })
  it('unconfirmed以外は訂正しない', () => {
    expect(shouldReconcileFirstSubmit({ ...base, lastFailOutcome: 'open-failed' })).toBe(false)
  })
  it('lastFailOutcomeがnull（そもそも失敗していない）なら訂正しない', () => {
    expect(shouldReconcileFirstSubmit({ ...base, lastFailOutcome: null })).toBe(false)
  })
  it('busy中（別の提出が進行中）は訂正しない', () => {
    expect(shouldReconcileFirstSubmit({ ...base, busy: true })).toBe(false)
  })
  it('必須フローは対象外', () => {
    expect(shouldReconcileFirstSubmit({ ...base, required: true })).toBe(false)
  })
  it('科目名が一致しなければ訂正しない', () => {
    expect(shouldReconcileFirstSubmit({ ...base, courseNameMatches: false })).toBe(false)
  })
  it('CLASS側がまだ未提出なら訂正しない', () => {
    expect(shouldReconcileFirstSubmit({ ...base, reactionSubmitted: false })).toBe(false)
  })
})

describe('shouldReconcileResubmit', () => {
  const base = { lastFailOutcome: 'unconfirmed' as const, courseNameMatches: true, fillOk: true }
  it('全条件が揃えば訂正する', () => {
    expect(shouldReconcileResubmit(base)).toBe(true)
  })
  it('unconfirmed以外は訂正しない', () => {
    expect(shouldReconcileResubmit({ ...base, lastFailOutcome: 'verify-failed' })).toBe(false)
  })
  it('科目名が一致しなければ訂正しない', () => {
    expect(shouldReconcileResubmit({ ...base, courseNameMatches: false })).toBe(false)
  })
  it('fillがokでなければ訂正しない', () => {
    expect(shouldReconcileResubmit({ ...base, fillOk: false })).toBe(false)
  })
})
