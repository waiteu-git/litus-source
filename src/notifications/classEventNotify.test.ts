import { describe, it, expect } from 'vitest'
import { classEventNotifications } from './classEventNotify'
import { buildAssignmentNotificationContent } from './assignmentContent'
import { planNotifications } from './notificationPlan'
import type { ClassEvent } from '../timetableEvents/classEvent'

/**
 * 各回イベント→通知枠への**変換層**のテスト。
 * ここが唯一テストされていない層だったため、「イベントを kind:'deadline-24h' へ潰す」バグが
 * 型検査もテストも通り抜けて全イベント通知の文面を壊していた（2026-07-17）。
 * 純粋層（eventSchedule / assignmentContent / notificationPlan）が個別に緑でも、
 * 繋ぎ目が壊れていれば通知は壊れる。
 */

const now = new Date(2026, 6, 17, 12, 0, 0)

const event = (over: Partial<ClassEvent> = {}): ClassEvent => ({
  id: 'e1',
  courseName: '線形代数1',
  courseCode: 'A123456',
  type: 'cancel',
  date: '2026-07-20',
  periods: [2],
  room: null,
  note: null,
  createdAt: now.toISOString(),
  ...over,
})

describe('classEventNotifications', () => {
  it('イベントを class-event として運ぶ（締切種別へ潰さない）', () => {
    const out = classEventNotifications([event()], now)
    expect(out.length).toBeGreaterThan(0)
    for (const n of out) expect(n.kind).toBe('class-event')
  })

  it('eventScheduleの文面をそのまま保持する', () => {
    const out = classEventNotifications([event()], now)
    const n = out[0]
    expect(n).toMatchObject({ kind: 'class-event', title: '線形代数1 休講', body: '2026-07-20' })
  })

  it('小テストは2段階（前日夜・当日朝）で別idになる', () => {
    const out = classEventNotifications([event({ type: 'quiz', id: 'q1' })], now)
    expect(out).toHaveLength(2)
    const ids = out.map((n) => (n.kind === 'class-event' ? n.eventId : ''))
    expect(new Set(ids).size).toBe(2)
    expect(ids.some((i) => i.endsWith(':eve'))).toBe(true)
    expect(ids.some((i) => i.endsWith(':day'))).toBe(true)
  })

  it('過去のイベントは通知しない', () => {
    expect(classEventNotifications([event({ date: '2026-07-01' })], now)).toEqual([])
  })
})

describe('変換層から実際に届く文面（end-to-end）', () => {
  it('休講が「締切まで24時間」にならない（回帰防止）', () => {
    const out = classEventNotifications([event()], now)
    const content = buildAssignmentNotificationContent(out[0])
    expect(content).toEqual({ title: '線形代数1 休講', body: '2026-07-20' })
    // 旧実装が出していた壊れた文面
    expect(content.title).not.toBe('締切まで24時間')
    expect(content.body).not.toContain('締切が近づいています')
  })

  it('全イベント種別で「締切」の語が混ざらない', () => {
    const types: ClassEvent['type'][] = ['cancel', 'makeup', 'roomChange', 'quiz', 'midterm', 'final', 'other']
    for (const type of types) {
      const out = classEventNotifications([event({ type, id: `x-${type}` })], now)
      for (const n of out) {
        const c = buildAssignmentNotificationContent(n)
        expect(c.title, `${type}のタイトル`).not.toContain('締切')
        expect(c.body, `${type}の本文`).not.toContain('締切')
      }
    }
  })

  it('予約枠を通しても class-event のまま残り、文面が保たれる', () => {
    const out = classEventNotifications([event({ type: 'quiz', id: 'q9' })], now)
    const plan = planNotifications([], out, now)
    expect(plan.assignments).toHaveLength(2)
    for (const n of plan.assignments) {
      expect(n.kind).toBe('class-event')
      expect(buildAssignmentNotificationContent(n).title).toBe('線形代数1 小テスト')
    }
  })

  it('イベントと課題が枠内で共存し、互いのidが衝突しない', () => {
    const events = classEventNotifications([event({ type: 'quiz', id: 'q1' })], now)
    const assignments = [
      {
        kind: 'deadline-24h' as const,
        assignmentId: 'https://letus/x',
        title: 'レポート1',
        fireAt: new Date(2026, 6, 18, 9, 0).toISOString(),
      },
    ]
    const plan = planNotifications([], [...events, ...assignments], now)
    expect(plan.assignments).toHaveLength(3)
  })
})
