/**
 * 通知タグの値のラチェット（N1 禁止事項4・T14）。
 * 出席の予約は差分同期になっても「集合に無いものをタグ一致で取り消す」ので、タグを変えると
 * 更新前に端末へ予約済みの通知が二度と掃除できない孤児になる（notificationTags.ts の冒頭）。
 * チャンネル ID は channelSpec.test.ts が既に文字列で固定している。
 */
import { describe, expect, it } from 'vitest'
import * as tags from './notificationTags'

/** 出荷済み（build 215 / v1.0.3）のタグ値。 */
const SHIPPED = {
  ATTENDANCE_TAG: 'attendance-alarm',
  ASSIGNMENT_TAG: 'assignment-reminder',
  CLASS_EVENT_TAG: 'class-event',
  BULLETIN_TAG: 'bulletin-new',
  ATTENDANCE_OPEN_TAG: 'attendance-open',
  LETUS_NEWS_TAG: 'letus-news',
} as const

function mismatches(actual: { [K in keyof typeof SHIPPED]: unknown }): string[] {
  return (Object.keys(SHIPPED) as (keyof typeof SHIPPED)[]).filter((k) => actual[k] !== SHIPPED[k])
}

describe('🔴 通知タグの値は出荷済みの文字列から変えない（N1 T14）', () => {
  it('6つの値が出荷済みの文字列と一致する', () => {
    expect(mismatches(tags)).toEqual([])
  })

  it('網羅性の母集合も同じ6つ（種別を足したらここにも足す）', () => {
    expect([...tags.ALL_NOTIFICATION_TAGS].sort()).toEqual(Object.values(SHIPPED).sort())
  })

  it('陰性の対照: 1文字でも変えると検出される', () => {
    expect(mismatches({ ...tags, ATTENDANCE_TAG: 'attendance-alarms' })).toEqual(['ATTENDANCE_TAG'])
  })
})
