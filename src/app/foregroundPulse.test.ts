import { describe, it, expect } from 'vitest'
import { shouldFirePulse, PULSE_MIN_GAP_MS, SLOT_OFFSETS_MS } from './foregroundPulse'

describe('shouldFirePulse', () => {
  it('初回（前回発火なし）は発火する', () => {
    expect(shouldFirePulse(null, 10_000)).toBe(true)
  })

  it('前回発火から最小間隔未満なら発火しない（高速なアプリ切替の抑制）', () => {
    expect(shouldFirePulse(10_000, 10_000 + PULSE_MIN_GAP_MS - 1)).toBe(false)
  })

  it('前回発火から最小間隔以上なら発火する', () => {
    expect(shouldFirePulse(10_000, 10_000 + PULSE_MIN_GAP_MS)).toBe(true)
  })
})

describe('SLOT_OFFSETS_MS', () => {
  it('重い処理ほど後ろに来る段階配置（即時 → 出席 → 通知 → LETUS同期）', () => {
    expect(SLOT_OFFSETS_MS.authWarmup).toBe(0)
    expect(SLOT_OFFSETS_MS.timetableReload).toBe(0)
    expect(SLOT_OFFSETS_MS.attendance).toBeGreaterThan(0)
    expect(SLOT_OFFSETS_MS.notifications).toBeGreaterThan(SLOT_OFFSETS_MS.attendance)
    expect(SLOT_OFFSETS_MS.letusSync).toBeGreaterThan(SLOT_OFFSETS_MS.notifications)
  })
})
