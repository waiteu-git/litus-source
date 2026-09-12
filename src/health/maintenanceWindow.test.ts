import { describe, expect, it } from 'vitest'
import { maintenanceEndAt, maintenanceSystemAt, maintenanceWindowLabel, systemDisplayName } from './maintenanceWindow'

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

describe('maintenanceEndAt（G1: メンテの帯の中は明けに1回だけ再確認する）', () => {
  it('CLASS 帯の中（2:30）はその日の 4:00:00.000', () => {
    const end = maintenanceEndAt(at(2, 30), 'class')
    expect(end).not.toBeNull()
    expect(end!.getTime()).toBe(new Date(2026, 6, 12, 4, 0, 0, 0).getTime())
  })
  it('帯の始まり（2:00）と終わり直前（3:59）も 4:00', () => {
    expect(maintenanceEndAt(at(2, 0), 'class')!.getTime()).toBe(new Date(2026, 6, 12, 4, 0, 0, 0).getTime())
    expect(maintenanceEndAt(at(3, 59), 'class')!.getTime()).toBe(new Date(2026, 6, 12, 4, 0, 0, 0).getTime())
  })
  it('陰性: 4:00（帯の終わりは含まない）と 1:59 は null', () => {
    expect(maintenanceEndAt(at(4, 0), 'class')).toBeNull()
    expect(maintenanceEndAt(at(1, 59), 'class')).toBeNull()
  })
  it('対照: 終わりの時刻は表から取る（LETUS 帯 4:30 → 5:30。4:00 の決め打ちなら落ちる）', () => {
    expect(maintenanceEndAt(at(4, 30), 'letus')!.getTime()).toBe(new Date(2026, 6, 12, 5, 30, 0, 0).getTime())
    expect(maintenanceEndAt(at(2, 30), 'letus')).toBeNull()
  })
})
