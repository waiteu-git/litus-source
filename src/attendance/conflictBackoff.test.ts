import { describe, expect, it } from 'vitest'
import {
  CONFLICT_MAX_MS,
  conflictDelayMs,
  isConflictExhausted,
} from './conflictBackoff'

describe('conflictDelayMs', () => {
  it('rand=0.5（ジッタ係数1.0）なら 7→14→28→56→112 秒の指数系列', () => {
    const series = [0, 1, 2, 3, 4].map((a) => conflictDelayMs(a, 0.5))
    expect(series).toEqual([7000, 14000, 28000, 56000, 112000])
  })

  it('大きなattemptでは CONFLICT_MAX_MS で頭打ちになる', () => {
    expect(conflictDelayMs(6, 0.5)).toBe(CONFLICT_MAX_MS)
    expect(conflictDelayMs(30, 0.5)).toBe(CONFLICT_MAX_MS)
  })

  it('rand=0 でジッタ下限の-20%', () => {
    expect(conflictDelayMs(0, 0)).toBe(5600)
  })

  it('randが1に近いときジッタ上限の+20%に漸近し、超えない', () => {
    expect(conflictDelayMs(0, 0.999999)).toBeLessThanOrEqual(8400)
    expect(conflictDelayMs(0, 0.999999)).toBeGreaterThan(8399)
  })

  it('ジッタを掛けても常に素の値の0.8〜1.2倍に収まる', () => {
    for (const rand of [0, 0.1, 0.33, 0.5, 0.77, 0.99]) {
      const d = conflictDelayMs(2, rand)
      expect(d).toBeGreaterThanOrEqual(28000 * 0.8)
      expect(d).toBeLessThanOrEqual(28000 * 1.2)
    }
  })
})

describe('isConflictExhausted', () => {
  it('試行4回目までは継続', () => {
    expect([0, 1, 2, 3, 4].map(isConflictExhausted)).toEqual([false, false, false, false, false])
  })

  it('5回に達したら打ち切り', () => {
    expect(isConflictExhausted(5)).toBe(true)
    expect(isConflictExhausted(6)).toBe(true)
  })
})
