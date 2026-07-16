import { describe, expect, it } from 'vitest'
import { VERIFY_TIMEOUT_MS, submitOutcome } from './submitOutcome'
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
})
