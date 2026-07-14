import { describe, expect, it } from 'vitest'
import { planSync } from './syncGuards'

// ローカル時刻（JST前提）でメンテ帯を踏まない平常時刻。
const NOON = new Date(2026, 6, 14, 12, 0)
const CLASS_MAINT = new Date(2026, 6, 14, 3, 0) // CLASS 2:00–4:00
const LETUS_MAINT = new Date(2026, 6, 14, 5, 0) // LETUS 4:00–5:30

describe('planSync', () => {
  it('平常時（オンライン・授業外）は両方 run', () => {
    expect(planSync({ now: NOON, isOnline: true, running: false })).toEqual({ bulletin: 'run', letus: 'run' })
  })

  it('オフラインは両方 offline', () => {
    expect(planSync({ now: NOON, isOnline: false, running: false })).toEqual({
      bulletin: 'offline',
      letus: 'offline',
    })
  })

  it('授業中は掲示のみ attending（課題は run）', () => {
    expect(planSync({ now: NOON, isOnline: true, running: true })).toEqual({ bulletin: 'attending', letus: 'run' })
  })

  it('CLASSメンテ帯は掲示のみ maintenance', () => {
    expect(planSync({ now: CLASS_MAINT, isOnline: true, running: false })).toEqual({
      bulletin: 'maintenance',
      letus: 'run',
    })
  })

  it('LETUSメンテ帯は課題のみ maintenance', () => {
    expect(planSync({ now: LETUS_MAINT, isOnline: true, running: false })).toEqual({
      bulletin: 'run',
      letus: 'maintenance',
    })
  })

  it('オフラインは授業中/メンテより優先（既存ガード順の維持）', () => {
    expect(planSync({ now: CLASS_MAINT, isOnline: false, running: true })).toEqual({
      bulletin: 'offline',
      letus: 'offline',
    })
  })
})
