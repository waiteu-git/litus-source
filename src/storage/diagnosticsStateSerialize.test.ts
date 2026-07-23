import { describe, it, expect } from 'vitest'
import {
  serializeDiagnosticsState,
  deserializeDiagnosticsState,
} from './diagnosticsStateSerialize'
import type { DiagnosticsState } from '../health/diagnosticsState'

const FULL: DiagnosticsState = {
  lastGoodAt: '2026-07-23T00:00:00.000Z',
  consecutiveFailures: 2,
  activeCodes: ['DASHBOARD_UNREADABLE', 'LOGGED_OUT'],
  infoCodes: ['UNSUPPORTED_MODULE'],
  lastCodes: ['DASHBOARD_UNREADABLE', 'LOGGED_OUT', 'UNSUPPORTED_MODULE'],
  updatedAt: '2026-07-23T01:00:00.000Z',
}

describe('diagnosticsStateSerialize', () => {
  it('roundtrip', () => {
    expect(deserializeDiagnosticsState(serializeDiagnosticsState(FULL))).toEqual(FULL)
  })

  it('lastGoodAt=null（一度も成功なし）を保持', () => {
    const s: DiagnosticsState = {
      lastGoodAt: null,
      consecutiveFailures: 1,
      activeCodes: [],
      infoCodes: [],
      lastCodes: ['DASHBOARD_UNREADABLE'],
      updatedAt: '2026-07-23T00:00:00.000Z',
    }
    expect(deserializeDiagnosticsState(serializeDiagnosticsState(s))).toEqual(s)
  })

  it('null / 壊れJSON / 非オブジェクト / 配列 は null（初回扱い）', () => {
    expect(deserializeDiagnosticsState(null)).toBe(null)
    expect(deserializeDiagnosticsState('{oops')).toBe(null)
    expect(deserializeDiagnosticsState('"str"')).toBe(null)
    expect(deserializeDiagnosticsState('[1]')).toBe(null)
    expect(deserializeDiagnosticsState('42')).toBe(null)
  })

  it('必須フィールド型不正は null', () => {
    // updatedAt 欠落
    expect(
      deserializeDiagnosticsState(JSON.stringify({ ...FULL, updatedAt: undefined })),
    ).toBe(null)
    // consecutiveFailures 非数値
    expect(
      deserializeDiagnosticsState(JSON.stringify({ ...FULL, consecutiveFailures: 'two' })),
    ).toBe(null)
    // consecutiveFailures 非有限
    expect(
      deserializeDiagnosticsState(JSON.stringify({ ...FULL, consecutiveFailures: null })),
    ).toBe(null)
    // lastGoodAt が string でも null でもない
    expect(deserializeDiagnosticsState(JSON.stringify({ ...FULL, lastGoodAt: 123 }))).toBe(null)
  })

  it('未知コードは捨て、既知コードのみ残す（版差の旧データ耐性）', () => {
    const raw = JSON.stringify({
      ...FULL,
      activeCodes: ['DASHBOARD_UNREADABLE', 'FUTURE_UNKNOWN_CODE', 42, null],
      infoCodes: ['UNSUPPORTED_MODULE', 'ALSO_UNKNOWN'],
      lastCodes: ['LOGGED_OUT'],
    })
    const out = deserializeDiagnosticsState(raw)
    expect(out?.activeCodes).toEqual(['DASHBOARD_UNREADABLE'])
    expect(out?.infoCodes).toEqual(['UNSUPPORTED_MODULE'])
    expect(out?.lastCodes).toEqual(['LOGGED_OUT'])
  })

  it('コード配列が配列でない場合は空配列に正規化', () => {
    const raw = JSON.stringify({ ...FULL, activeCodes: 'nope', infoCodes: null, lastCodes: 5 })
    const out = deserializeDiagnosticsState(raw)
    expect(out?.activeCodes).toEqual([])
    expect(out?.infoCodes).toEqual([])
    expect(out?.lastCodes).toEqual([])
  })

  it('コード配列内の重複を排除する', () => {
    const raw = JSON.stringify({
      ...FULL,
      lastCodes: ['LOGGED_OUT', 'LOGGED_OUT', 'DASHBOARD_UNREADABLE'],
    })
    expect(deserializeDiagnosticsState(raw)?.lastCodes).toEqual([
      'LOGGED_OUT',
      'DASHBOARD_UNREADABLE',
    ])
  })
})
