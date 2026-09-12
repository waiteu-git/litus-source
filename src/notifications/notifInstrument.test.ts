import { describe, expect, it } from 'vitest'
import { formatNotifLine } from './notifInstrument'
import type { PendingRequestLike } from './attendanceSync'

const NOW = new Date(2026, 8, 14, 9, 0)
const fire = (h: number, m: number, s = 0) => new Date(2026, 8, 14, h, m, s).toISOString()
const p = (identifier: string, data: Record<string, unknown> | null): PendingRequestLike => ({ identifier, data })

describe('計器の1行（N1 §4.6・T16）', () => {
  it('例の形で出る（出席の件数・重複・旧形・次の時刻・課題・失敗・受付open 済み）', () => {
    const pending = [
      p('att:s:20260914-1040', { tag: 'attendance-alarm', kind: 'attendance-start', fireAt: fire(10, 40), courseNames: ['線形代数1'] }),
      p('att:l:20260914-1200', { tag: 'attendance-alarm', kind: 'attendance-last-chance', fireAt: fire(12, 0) }),
      p('uuid-1', { tag: 'assignment-reminder', kind: 'deadline-24h' }),
      p('uuid-2', { tag: 'class-event', kind: 'class-event' }),
    ]
    expect(formatNotifLine({ pending, failures: 0, announced: ['att:s:20260914-1040', 'att:s:20260913-1040'], now: NOW })).toBe(
      'notif att=2 dupe=0 legacy=0 next=09-14T10:40 asg=2 fail=0 open=1',
    )
  })

  it('同じ種類・同じ時刻（分）の2件目以降を dupe、決まった形でない identifier を legacy に数える', () => {
    const pending = [
      p('att:s:20260914-1040', { tag: 'attendance-alarm', kind: 'attendance-start', fireAt: fire(10, 40) }),
      p('9b1e-uuid', { tag: 'attendance-alarm', kind: 'attendance-start', fireAt: fire(10, 40, 20) }),
      p('7c2d-uuid', { tag: 'attendance-alarm', kind: 'attendance-start' }),
    ]
    expect(formatNotifLine({ pending, failures: 3, announced: [], now: NOW })).toBe(
      'notif att=3 dupe=1 legacy=2 next=09-14T10:40 asg=0 fail=3 open=0',
    )
  })

  it('ASCII だけで、payload に科目名があっても出さない', () => {
    const line = formatNotifLine({
      pending: [p('att:s:20260914-1040', { tag: 'attendance-alarm', kind: 'attendance-start', fireAt: fire(10, 40), courseNames: ['情報科学概論A'] })],
      failures: 0,
      announced: [],
      now: NOW,
    })
    expect(line).toMatch(/^[\x20-\x7E]+$/)
    expect(line).not.toContain('情報')
  })

  it('next は payload の fireAt から出る（trigger に時刻の無い iOS 形でも空にならない）', () => {
    const line = formatNotifLine({
      pending: [p('att:l:20260914-1200', { tag: 'attendance-alarm', kind: 'attendance-last-chance', fireAt: fire(12, 0) })],
      failures: 0,
      announced: [],
      now: NOW,
    })
    expect(line).toContain('next=09-14T12:00')
  })

  it('陰性の対照: fireAt の無い旧形だけなら next=-（時刻を騙らない）', () => {
    const line = formatNotifLine({ pending: [p('uuid', { tag: 'attendance-alarm', kind: 'attendance-start' })], failures: 0, announced: [], now: NOW })
    expect(line).toContain('next=-')
    expect(line).toContain('legacy=1')
  })
})
