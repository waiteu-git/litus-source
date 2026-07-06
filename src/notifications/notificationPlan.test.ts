import { planNotifications } from './notificationPlan'
import type { AttendanceAlarm } from './attendanceSchedule'
import type { ScheduledNotification } from './schedule'

const now = new Date('2026-07-06T00:00:00.000Z')
const H = 60 * 60 * 1000

function att(courseCode: string, fireAtMsFromNow: number): AttendanceAlarm {
  return {
    kind: 'attendance-start',
    courseCode,
    courseName: `科目${courseCode}`,
    day: 'mon',
    period: 1,
    fireAt: new Date(now.getTime() + fireAtMsFromNow).toISOString(),
  }
}
function reminder(id: string, fireAtMsFromNow: number): ScheduledNotification {
  return {
    kind: 'deadline-24h',
    assignmentId: id,
    title: id,
    fireAt: new Date(now.getTime() + fireAtMsFromNow).toISOString(),
  }
}
function digest(fireAtMsFromNow: number): ScheduledNotification {
  return {
    kind: 'morning-digest',
    fireAt: new Date(now.getTime() + fireAtMsFromNow).toISOString(),
    dueToday: 1,
    dueTomorrow: 0,
  }
}

describe('planNotifications', () => {
  it('cap以下は全件を出席/課題に分けて返す', () => {
    const plan = planNotifications([att('A', 2 * H)], [reminder('r1', 3 * H), digest(30 * H)], now, { cap: 60 })
    expect(plan.attendance.map((a) => a.courseCode)).toEqual(['A'])
    expect(plan.assignments).toHaveLength(2)
  })
  it('出席は遠い発火でも課題より優先して残る（枠が厳しくても押し出されない）', () => {
    const attendance = [att('A', 20 * 24 * H)] // 20日先の出席
    const assignments = [reminder('r1', 1 * H), reminder('r2', 2 * H)] // 近い課題2件
    const plan = planNotifications(attendance, assignments, now, { cap: 2 })
    expect(plan.attendance.map((a) => a.courseCode)).toEqual(['A'])
    // cap=2、出席1件で残枠1 → 近い課題r1が残りr2が落ちる
    expect(plan.assignments.map((a) => (a as { assignmentId: string }).assignmentId)).toEqual(['r1'])
  })
  it('近接の課題/まとめは far-future の課題より優先される', () => {
    const assignments = [
      reminder('far', 10 * 24 * H), // 10日先=far
      digest(20 * H), // 明日朝=near
    ]
    const plan = planNotifications([], assignments, now, { cap: 1, nearWindowMs: 48 * H })
    // near digest が far reminder より残る
    expect(plan.assignments).toHaveLength(1)
    expect(plan.assignments[0].kind).toBe('morning-digest')
  })
  it('総数は cap を超えない', () => {
    const attendance = [att('A', 1 * H), att('B', 2 * H)]
    const assignments = [reminder('r1', 3 * H), reminder('r2', 4 * H), digest(20 * H)]
    const plan = planNotifications(attendance, assignments, now, { cap: 3 })
    expect(plan.attendance.length + plan.assignments.length).toBe(3)
    // 出席は最優先なので2件とも残る
    expect(plan.attendance).toHaveLength(2)
  })
})
