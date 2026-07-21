import { describe, it, expect, beforeEach } from 'vitest'
import { setDemoNamespace, isDemoNamespace, demoKey, DEMO_PREFIX } from './asyncStorage'

describe('デモ名前空間のキー変換', () => {
  beforeEach(() => setDemoNamespace(false))

  it('通常時はキーをそのまま返す', () => {
    expect(demoKey('timetable.collections.v1')).toBe('timetable.collections.v1')
  })

  it('デモ中は demo: を前置する', () => {
    setDemoNamespace(true)
    expect(demoKey('timetable.collections.v1')).toBe('demo:timetable.collections.v1')
  })

  it('DEMO_PREFIX は demo:', () => {
    expect(DEMO_PREFIX).toBe('demo:')
  })

  it('isDemoNamespace が状態を返す', () => {
    expect(isDemoNamespace()).toBe(false)
    setDemoNamespace(true)
    expect(isDemoNamespace()).toBe(true)
  })

  it('二重前置しない（デモキーを再変換しても1つだけ）', () => {
    setDemoNamespace(true)
    expect(demoKey(demoKey('theme.variant.v1'))).toBe('demo:theme.variant.v1')
  })
})
