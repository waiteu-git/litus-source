import { describe, it, expect } from 'vitest'
import { shouldSeedDemo, DEMO_SEEDED_KEY } from './demoState'

describe('shouldSeedDemo', () => {
  it('未シードならシードする', () => {
    expect(shouldSeedDemo(null)).toBe(true)
  })
  it('シード済みなら再投入しない', () => {
    expect(shouldSeedDemo('1')).toBe(false)
  })
  it('壊れた値ならシードし直す', () => {
    expect(shouldSeedDemo('garbage')).toBe(true)
  })
  it('シード済みフラグのキーはデモ名前空間へ入る形', () => {
    // 実キーを汚さないよう、他のストアと同じく Storage 経由で読み書きする前提のキー名。
    expect(DEMO_SEEDED_KEY).toBe('demo.seeded.v1')
  })
})
