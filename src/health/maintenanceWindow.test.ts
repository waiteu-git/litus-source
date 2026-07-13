import { describe, expect, it } from 'vitest'
import { maintenanceSystemAt, maintenanceWindowLabel, systemDisplayName } from './maintenanceWindow'

// ローカル時刻で h:m の Date を作る（テストは端末ローカル＝実行環境のTZに依存しない: getHours/getMinutesで判定）。
const at = (h: number, m = 0) => new Date(2026, 6, 12, h, m, 0)

describe('maintenanceSystemAt', () => {
  it('CLASS帯は [02:00, 04:00)', () => {
    expect(maintenanceSystemAt(at(1, 59))).toBeNull()
    expect(maintenanceSystemAt(at(2, 0))).toBe('class')
    expect(maintenanceSystemAt(at(3, 0))).toBe('class')
    expect(maintenanceSystemAt(at(3, 59))).toBe('class')
  })
  it('LETUS帯は [04:00, 05:30)', () => {
    expect(maintenanceSystemAt(at(4, 0))).toBe('letus')
    expect(maintenanceSystemAt(at(5, 0))).toBe('letus')
    expect(maintenanceSystemAt(at(5, 29))).toBe('letus')
    expect(maintenanceSystemAt(at(5, 30))).toBeNull()
  })
  it('帯の外は null', () => {
    expect(maintenanceSystemAt(at(0, 0))).toBeNull()
    expect(maintenanceSystemAt(at(6, 0))).toBeNull()
    expect(maintenanceSystemAt(at(12, 0))).toBeNull()
    expect(maintenanceSystemAt(at(23, 59))).toBeNull()
  })
})

describe('maintenanceWindowLabel', () => {
  it('時間帯ラベル', () => {
    expect(maintenanceWindowLabel('class')).toBe('2:00–4:00')
    expect(maintenanceWindowLabel('letus')).toBe('4:00–5:30')
  })
})

describe('systemDisplayName', () => {
  it("class は 'CLASS'", () => {
    expect(systemDisplayName('class')).toBe('CLASS')
  })
  it("letus は 'LETUS'", () => {
    expect(systemDisplayName('letus')).toBe('LETUS')
  })
})
