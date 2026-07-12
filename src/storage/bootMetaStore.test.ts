import { describe, expect, it } from 'vitest'
import { isSameOperationalDay, isWarmBoot, operationalDayIndex } from './bootMetaStore'

// ローカル時刻での各時刻（テスト実行機のTZに依存しないよう相対で組む）。
function at(y: number, m: number, d: number, h: number, min = 0): number {
  return new Date(y, m - 1, d, h, min, 0, 0).getTime()
}

describe('operationalDayIndex / isSameOperationalDay', () => {
  it('4:00より前は前日の運用日に属する', () => {
    // 7/12 03:59 と 7/11 12:00 は同じ運用日（7/11）。
    expect(isSameOperationalDay(at(2026, 7, 12, 3, 59), at(2026, 7, 11, 12, 0))).toBe(true)
  })
  it('4:00以降は当日の運用日', () => {
    // 7/12 04:01 と 7/12 20:00 は同じ運用日（7/12）。
    expect(isSameOperationalDay(at(2026, 7, 12, 4, 1), at(2026, 7, 12, 20, 0))).toBe(true)
  })
  it('4:00境界をまたぐと別運用日', () => {
    // 7/12 03:59（=7/11運用日）と 7/12 04:01（=7/12運用日）は別。
    expect(isSameOperationalDay(at(2026, 7, 12, 3, 59), at(2026, 7, 12, 4, 1))).toBe(false)
  })
  it('同一運用日はインデックスが一致', () => {
    expect(operationalDayIndex(at(2026, 7, 12, 4, 1))).toBe(operationalDayIndex(at(2026, 7, 12, 23, 59)))
  })
})

describe('isWarmBoot', () => {
  const now = at(2026, 7, 12, 9, 0)
  const freshTt = now - 60 * 60 * 1000 // 1時間前（20h閾値内=新鮮）
  const staleTt = now - 21 * 60 * 60 * 1000 // 21時間前（stale）

  it('同運用日authed かつ 時間割新鮮なら warm', () => {
    expect(isWarmBoot(at(2026, 7, 12, 8, 0), freshTt, now)).toBe(true)
  })
  it('lastAuthedAt=0（初回/未記録）は full', () => {
    expect(isWarmBoot(0, freshTt, now)).toBe(false)
  })
  it('前運用日のauthedは full（その日最初の起動）', () => {
    expect(isWarmBoot(at(2026, 7, 11, 20, 0), freshTt, now)).toBe(false)
  })
  it('時間割が stale（setupが走る）なら full', () => {
    expect(isWarmBoot(at(2026, 7, 12, 8, 0), staleTt, now)).toBe(false)
  })
})
