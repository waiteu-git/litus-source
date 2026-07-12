import { describe, expect, it } from 'vitest'
import { evaluateAccess } from './accessGate'

// ローカル時刻で h:m の Date を作る（getHours/getMinutes判定なのでTZ非依存）。
const at = (h: number, m = 0) => new Date(2026, 6, 12, h, m, 0)

describe('evaluateAccess', () => {
  it('オンライン・帯外は許可', () => {
    expect(evaluateAccess('class', { now: at(12, 0), isOnline: true })).toEqual({ allowed: true, reason: 'ok' })
    expect(evaluateAccess('letus', { now: at(12, 0), isOnline: true })).toEqual({ allowed: true, reason: 'ok' })
  })
  it('オンライン・自システムのメンテ帯は不可(maintenance)', () => {
    expect(evaluateAccess('class', { now: at(3, 0), isOnline: true })).toEqual({ allowed: false, reason: 'maintenance' })
    expect(evaluateAccess('letus', { now: at(4, 30), isOnline: true })).toEqual({ allowed: false, reason: 'maintenance' })
  })
  it('オンライン・他システムのメンテ帯は許可', () => {
    // CLASSはLETUS帯(4:30)では稼働
    expect(evaluateAccess('class', { now: at(4, 30), isOnline: true })).toEqual({ allowed: true, reason: 'ok' })
    // LETUSはCLASS帯(3:00)では稼働
    expect(evaluateAccess('letus', { now: at(3, 0), isOnline: true })).toEqual({ allowed: true, reason: 'ok' })
  })
  it('オフラインは system/時刻に関わらず不可(offline)。offline > maintenance', () => {
    expect(evaluateAccess('class', { now: at(12, 0), isOnline: false })).toEqual({ allowed: false, reason: 'offline' })
    expect(evaluateAccess('class', { now: at(3, 0), isOnline: false })).toEqual({ allowed: false, reason: 'offline' })
    expect(evaluateAccess('letus', { now: at(4, 30), isOnline: false })).toEqual({ allowed: false, reason: 'offline' })
  })
  it('境界: CLASS 2:00不可 / 4:00許可、LETUS 4:00不可 / 5:30許可（オンライン）', () => {
    expect(evaluateAccess('class', { now: at(2, 0), isOnline: true }).allowed).toBe(false)
    expect(evaluateAccess('class', { now: at(4, 0), isOnline: true }).allowed).toBe(true)
    expect(evaluateAccess('letus', { now: at(4, 0), isOnline: true }).allowed).toBe(false)
    expect(evaluateAccess('letus', { now: at(5, 30), isOnline: true }).allowed).toBe(true)
  })
})
