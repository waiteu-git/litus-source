import { describe, expect, it } from 'vitest'
import { decideClassSync } from './classSyncConfirm'
import type { AccessDecision } from '../health/accessGate'

const ok: AccessDecision = { allowed: true, reason: 'ok' }
const offline: AccessDecision = { allowed: false, reason: 'offline' }
const maint: AccessDecision = { allowed: false, reason: 'maintenance' }

describe('decideClassSync', () => {
  it('授業中でなく通信OKなら run', () => {
    expect(decideClassSync({ access: ok, running: false, attendanceFocused: false })).toEqual({ kind: 'run' })
  })
  it('オフラインは blocked(offline)（授業中でも通信不許可が優先）', () => {
    expect(decideClassSync({ access: offline, running: true, attendanceFocused: false })).toEqual({
      kind: 'blocked',
      reason: 'offline',
    })
  })
  it('メンテナンス帯は blocked(maintenance)', () => {
    expect(decideClassSync({ access: maint, running: false, attendanceFocused: false })).toEqual({
      kind: 'blocked',
      reason: 'maintenance',
    })
  })
  it('授業中・出席タブ非表示・override無しなら confirm（確認して回せる）', () => {
    expect(decideClassSync({ access: ok, running: true, attendanceFocused: false })).toEqual({ kind: 'confirm' })
  })
  it('授業中・出席タブ非表示・override有りなら run', () => {
    expect(decideClassSync({ access: ok, running: true, attendanceFocused: false, override: true })).toEqual({
      kind: 'run',
    })
  })
  it('授業中でも出席タブ表示中は blocked(attending)＝据え置き（確認を出さない）', () => {
    expect(decideClassSync({ access: ok, running: true, attendanceFocused: true })).toEqual({
      kind: 'blocked',
      reason: 'attending',
    })
  })
  it('出席タブ表示中は override があっても回さない（出席画面を壊さない）', () => {
    expect(decideClassSync({ access: ok, running: true, attendanceFocused: true, override: true })).toEqual({
      kind: 'blocked',
      reason: 'attending',
    })
  })
})
