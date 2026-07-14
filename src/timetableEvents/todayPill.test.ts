import { describe, it, expect } from 'vitest'
import { shouldShowTodayPill } from './todayPill'

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const

describe('shouldShowTodayPill', () => {
  it('リスト表示で今日以外の曜日を見ているときは出す', () => {
    expect(shouldShowTodayPill({ view: 'list', selDay: 'mon', todayKey: 'wed', days: DAYS })).toBe(true)
  })
  it('リスト表示でも今日を見ているときは出さない', () => {
    expect(shouldShowTodayPill({ view: 'list', selDay: 'wed', todayKey: 'wed', days: DAYS })).toBe(false)
  })
  it('グリッド表示では今日以外でも出さない（全曜日が見えているため）', () => {
    expect(shouldShowTodayPill({ view: 'grid', selDay: 'mon', todayKey: 'wed', days: DAYS })).toBe(false)
  })
  it('今日が表示中の曜日集合に無いときは戻る先が無いので出さない', () => {
    // 今日=日曜だが土日が非表示（days は平日のみ）
    expect(shouldShowTodayPill({ view: 'list', selDay: 'mon', todayKey: 'sun', days: DAYS })).toBe(false)
  })
  it('土曜が表示されていれば今日=土でも平日閲覧中なら出す', () => {
    const withSat = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
    expect(shouldShowTodayPill({ view: 'list', selDay: 'fri', todayKey: 'sat', days: withSat })).toBe(true)
  })
})
