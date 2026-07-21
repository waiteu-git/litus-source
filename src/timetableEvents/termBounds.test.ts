import { describe, it, expect } from 'vitest'
import { deriveTermBounds } from './termBounds'

const WED = new Date(2026, 6, 15) // 2026-07-15 水（現在週offset=0・既定週月曜=7/13）

describe('deriveTermBounds', () => {
  it('出欠データ無しは学期起点null・今週offset±(過去2〜先16)', () => {
    expect(deriveTermBounds([], WED)).toEqual({ termStartMonday: null, min: -2, max: 16 })
  })

  it('日付集合の最小/最大週を offset 範囲へ（7/8〜7/29 → min -1, max 2）', () => {
    const b = deriveTermBounds([new Date(2026, 6, 8), new Date(2026, 6, 29)], WED)
    expect([b.termStartMonday!.getMonth(), b.termStartMonday!.getDate()]).toEqual([6, 6]) // 7/6 月
    expect(b.min).toBe(-1)
    expect(b.max).toBe(2)
  })

  it('全て過去でも現在週(offset 0)は範囲に含める', () => {
    const b = deriveTermBounds([new Date(2026, 6, 1)], WED) // 7/1 水 → 週月曜 6/29
    expect(b.min).toBe(-2)
    expect(b.max).toBe(0) // maxOff=-2 だが現在週0を含める
  })
})
