import { describe, expect, test } from 'vitest'
import { swipeTargetDay } from './daySwipe'

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const
const FULL_WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

describe('swipeTargetDay', () => {
  test('nextで翌曜日へ移動する', () => {
    expect(swipeTargetDay(WEEKDAYS, 'tue', 'next')).toBe('wed')
  })

  test('prevで前曜日へ移動する', () => {
    expect(swipeTargetDay(WEEKDAYS, 'tue', 'prev')).toBe('mon')
  })

  test('末尾でnextはnull（クランプ・移動なし）', () => {
    expect(swipeTargetDay(WEEKDAYS, 'fri', 'next')).toBeNull()
  })

  test('先頭でprevはnull（クランプ・移動なし）', () => {
    expect(swipeTargetDay(WEEKDAYS, 'mon', 'prev')).toBeNull()
  })

  test('土日入りの配列でも配列順で移動する', () => {
    expect(swipeTargetDay(FULL_WEEK, 'fri', 'next')).toBe('sat')
    expect(swipeTargetDay(FULL_WEEK, 'sun', 'prev')).toBe('sat')
    expect(swipeTargetDay(FULL_WEEK, 'sun', 'next')).toBeNull()
  })

  test('現在曜日が配列に無ければnull（土日の出入りで一時的に外れるケース）', () => {
    expect(swipeTargetDay(WEEKDAYS, 'sun', 'next')).toBeNull()
    expect(swipeTargetDay(WEEKDAYS, 'sun', 'prev')).toBeNull()
  })

  test('空配列ではnull', () => {
    expect(swipeTargetDay([], 'mon', 'next')).toBeNull()
  })
})
