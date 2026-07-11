import { describe, expect, it } from 'vitest'
import { isUnderMaintenance, maintenanceSystemAt, maintenanceWindowLabel } from './maintenanceWindow'

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

describe('isUnderMaintenance', () => {
  it('CLASSはCLASS帯のみ真（LETUS帯ではCLASSは稼働）', () => {
    expect(isUnderMaintenance('class', at(3, 0))).toBe(true)
    expect(isUnderMaintenance('class', at(4, 30))).toBe(false)
  })
  it('LETUSはLETUS帯のみ真（CLASS帯ではLETUSは稼働）', () => {
    expect(isUnderMaintenance('letus', at(4, 30))).toBe(true)
    expect(isUnderMaintenance('letus', at(3, 0))).toBe(false)
  })
})

describe('maintenanceWindowLabel', () => {
  it('時間帯ラベル', () => {
    expect(maintenanceWindowLabel('class')).toBe('2:00–4:00')
    expect(maintenanceWindowLabel('letus')).toBe('4:00–5:30')
  })
})
