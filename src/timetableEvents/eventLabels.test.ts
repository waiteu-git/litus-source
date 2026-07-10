import { describe, expect, it } from 'vitest'
import { eventTypeLabel, shortDate, cellBadgeText } from './eventLabels'
import type { ClassEvent } from './classEvent'

const ev = (o: Partial<ClassEvent>): ClassEvent => ({
  id: 'e', courseName: 'X', courseCode: null, type: 'quiz', date: '2026-07-15',
  periods: [1], room: null, note: null, createdAt: '', ...o,
})

describe('eventTypeLabel', () => {
  it('日本語ラベル', () => {
    expect(eventTypeLabel('cancel')).toBe('休講')
    expect(eventTypeLabel('roomChange')).toBe('教室変更')
    expect(eventTypeLabel('final')).toBe('期末')
  })
})
describe('shortDate', () => {
  it('M/D', () => {
    expect(shortDate('2026-07-15')).toBe('7/15')
    expect(shortDate('bad')).toBe('bad')
  })
})
describe('cellBadgeText', () => {
  it('小テストは「小テスト 7/15」', () => {
    expect(cellBadgeText(ev({ type: 'quiz' }))).toBe('小テスト 7/15')
  })
  it('教室変更は矢印付き', () => {
    expect(cellBadgeText(ev({ type: 'roomChange', room: 'K404' }))).toBe('教室変更→K404 7/15')
  })
  it('休講は補講状態を付記', () => {
    expect(cellBadgeText(ev({ type: 'cancel', makeupStatus: 'has', makeup: { date: '2026-07-22', periods: [3], room: null } }))).toBe('休講 7/15 ・ 補講 7/22')
    expect(cellBadgeText(ev({ type: 'cancel', makeupStatus: 'undecided' }))).toBe('休講 7/15 ・ 補講未定')
    expect(cellBadgeText(ev({ type: 'cancel', makeupStatus: 'none' }))).toBe('休講 7/15 ・ 補講なし')
  })
})
