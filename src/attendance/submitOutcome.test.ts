import { describe, expect, it } from 'vitest'
import { VERIFY_TIMEOUT_MS, submitFailureText, submitOutcome } from './submitOutcome'
import type { SubmitResult } from './engine'

const base: SubmitResult = { result: '送信しました', ok: false, wrong: false, err: false }

describe('submitOutcome', () => {
  it('送信していなければ none', () => {
    expect(submitOutcome({ result: null, attended: false, elapsedMs: 0 })).toBe('none')
  })

  it('actuatorが成功を検出したら ok', () => {
    expect(submitOutcome({ result: { ...base, ok: true }, attended: false, elapsedMs: 0 })).toBe('ok')
  })

  it('CLASSが出席済みを示したら ok（actuatorのテキスト検出が外れていても確定成功）', () => {
    expect(submitOutcome({ result: base, attended: true, elapsedMs: 0 })).toBe('ok')
  })

  it('コード誤り・エラーは failed', () => {
    expect(submitOutcome({ result: { ...base, wrong: true }, attended: false, elapsedMs: 0 })).toBe('failed')
    expect(submitOutcome({ result: { ...base, err: true }, attended: false, elapsedMs: 0 })).toBe('failed')
  })

  it('送信ボタンが見つからなければ即 failed（待っても登録されない）', () => {
    expect(submitOutcome({ result: { ...base, btnFound: false }, attended: false, elapsedMs: 0 })).toBe('failed')
  })

  it('確認窓の内側は verifying（送信直後は待つ）', () => {
    expect(submitOutcome({ result: base, attended: false, elapsedMs: 0 })).toBe('verifying')
    expect(submitOutcome({ result: base, attended: false, elapsedMs: VERIFY_TIMEOUT_MS - 1 })).toBe('verifying')
  })

  it('確認窓を超えて出席済みにならなければ failed（永久に「確認しています」で止めない）', () => {
    expect(submitOutcome({ result: base, attended: false, elapsedMs: VERIFY_TIMEOUT_MS })).toBe('failed')
    expect(submitOutcome({ result: base, attended: false, elapsedMs: VERIFY_TIMEOUT_MS + 60000 })).toBe('failed')
  })

  it('タイムアウト後でも出席済みになったら ok が優先', () => {
    expect(submitOutcome({ result: base, attended: true, elapsedMs: VERIFY_TIMEOUT_MS + 1 })).toBe('ok')
  })

  it('btnFound=true は通常どおり確認窓に入る', () => {
    expect(submitOutcome({ result: { ...base, btnFound: true }, attended: false, elapsedMs: 0 })).toBe('verifying')
  })

  // 2026-07-22 実機ログ: 受付中の授業が無い画面なのに actuator が ok=true を返し、
  // 画面が緑チェックで「出席を登録しました」と表示した（＝学生が確認せず欠席しうる）。
  // ok がなぜ立ったかは未特定だが、受付が無い以上は成功と両立しない。
  describe('受付なし（status=none）を成功より優先する', () => {
    it('actuatorが ok=true でも受付なしなら failed', () => {
      expect(
        submitOutcome({ result: { ...base, ok: true }, attended: false, elapsedMs: 0, receptionStatus: 'none' }),
      ).toBe('failed')
    })

    it('CLASSが出席済みを示していれば受付なしでも ok（確定マーカーが最優先）', () => {
      expect(
        submitOutcome({ result: { ...base, ok: true }, attended: true, elapsedMs: 0, receptionStatus: 'none' }),
      ).toBe('ok')
    })

    it('受付中・リアペ待ちなど none 以外は従来どおり ok を尊重する', () => {
      for (const s of ['accepting', 'reaction_pending', 'closed', 'unknown', 'attended'] as const) {
        expect(
          submitOutcome({ result: { ...base, ok: true }, attended: false, elapsedMs: 0, receptionStatus: s }),
        ).toBe('ok')
      }
    })

    it('受付状態が未取得（旧呼び出し）なら従来どおり', () => {
      expect(submitOutcome({ result: { ...base, ok: true }, attended: false, elapsedMs: 0 })).toBe('ok')
      expect(
        submitOutcome({ result: { ...base, ok: true }, attended: false, elapsedMs: 0, receptionStatus: null }),
      ).toBe('ok')
    })
  })
})

describe('submitFailureText', () => {
  it('ガードで失敗にしたときは「登録しました」を出さない（判定と文言を矛盾させない）', () => {
    const r = { ...base, ok: true, result: '出席登録しました' }
    expect(submitFailureText({ result: r, receptionStatus: 'none' })).toBe(
      '出席確認中の授業がありません（登録されていません）',
    )
  })

  it('通常の失敗は actuator の理由をそのまま出す', () => {
    const r = { ...base, wrong: true, result: '認証コードが違います（コードを確認してください）' }
    expect(submitFailureText({ result: r, receptionStatus: 'accepting' })).toBe(
      '認証コードが違います（コードを確認してください）',
    )
  })

  it('結果が無いときも空にしない', () => {
    expect(submitFailureText({ result: null })).toBe('送信できませんでした')
  })
})
