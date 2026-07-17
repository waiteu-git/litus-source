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
  // 【2026-07-17 に仕様ごと訂正】以前ここは「出席は遠い発火でも課題より優先して残る」を
  // **正しい不変条件として固定していた**。だが出席は daysAhead=7 で全コマ×2通ぶん生成されるため、
  // その規則は実データで cap60 を出席が食い尽くし**課題通知を全滅させる**（実測: 前期+後期で予約0件）。
  // テストが cap:2・出席1件という非現実的な規模だったので、コードとテストが同じ誤前提を共有したまま
  // 緑で通り続けていた。守るべきは「**近い**出席が課題に勝つ」であって「遠い出席が勝つ」ではない。
  it('近い出席は課題より優先して残る', () => {
    const attendance = [att('A', 2 * H)] // 2時間後＝near
    const assignments = [reminder('r1', 1 * H), reminder('r2', 2 * H)]
    const plan = planNotifications(attendance, assignments, now, { cap: 2 })
    expect(plan.attendance.map((a) => a.courseCode)).toEqual(['A'])
    expect(plan.assignments.map((a) => (a as { assignmentId: string }).assignmentId)).toEqual(['r1'])
  })
  it('遠い出席は近い課題に負ける（枠を食い潰させない）', () => {
    const attendance = [att('A', 20 * 24 * H)] // 20日先＝far
    const assignments = [reminder('r1', 1 * H), reminder('r2', 2 * H)] // 近い課題2件
    const plan = planNotifications(attendance, assignments, now, { cap: 2 })
    expect(plan.attendance).toEqual([])
    expect(plan.assignments.map((a) => (a as { assignmentId: string }).assignmentId)).toEqual(['r1', 'r2'])
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

describe('出席アラームが枠を食い潰さない（実規模・2026-07-17の全滅を再現していた条件）', () => {
  const now = new Date(2026, 6, 17, 9, 0, 0)
  const iso = (dayOffset: number, h: number) =>
    new Date(2026, 6, 17 + dayOffset, h, 0, 0).toISOString()

  /** daysAhead=7・5コマ×5日ぶんの出席アラーム（開始＋終了前の2通/コマ）＝50件。 */
  const manyAttendance = () => {
    const out: AttendanceAlarm[] = []
    for (let d = 1; d <= 5; d++) {
      for (let p = 1; p <= 5; p++) {
        for (const kind of ['attendance-start', 'attendance-last-chance'] as const) {
          out.push({
            kind,
            courseCode: `C${p}`,
            courseName: `科目${p}`,
            day: 'mon',
            period: p,
            fireAt: iso(d, 8 + p),
          })
        }
      }
    }
    return out
  }

  /** 今夜の締切1時間前（最も落としてはいけない通知）。 */
  const tonight1h: ScheduledNotification = {
    kind: 'deadline-1h',
    assignmentId: 'urgent',
    title: 'レポート課題3',
    fireAt: iso(0, 23),
  }

  it('出席50件があっても今夜の締切1時間前は必ず残る', () => {
    const plan = planNotifications(manyAttendance(), [tonight1h], now)
    expect(plan.assignments).toContainEqual(tonight1h)
  })

  it('近接の出席は守る（従来の不変条件を壊さない）', () => {
    const plan = planNotifications(manyAttendance(), [tonight1h], now)
    const nearAlarms = plan.attendance.filter(
      (a) => new Date(a.fireAt).getTime() <= now.getTime() + 48 * 60 * 60 * 1000,
    )
    expect(nearAlarms.length).toBeGreaterThan(0)
  })

  it('遠い出席より近い課題が優先される（20日先の出席 < 今夜の締切）', () => {
    const farAttendance: AttendanceAlarm[] = [
      {
        kind: 'attendance-start',
        courseCode: 'F',
        courseName: '遠い授業',
        day: 'mon',
        period: 1,
        fireAt: iso(20, 9),
      },
    ]
    const plan = planNotifications(farAttendance, [tonight1h], now, { cap: 1 })
    expect(plan.assignments).toEqual([tonight1h])
    expect(plan.attendance).toEqual([])
  })

  it('課題通知が全滅しない（枠の大半を出席が占めても課題が残る）', () => {
    const assignments: ScheduledNotification[] = Array.from({ length: 34 }, (_, i) => ({
      kind: 'deadline-1h' as const,
      assignmentId: `a${i}`,
      title: `課題${i}`,
      fireAt: iso(1, 10),
    }))
    const plan = planNotifications(manyAttendance(), assignments, now)
    expect(plan.assignments.length).toBeGreaterThan(0)
  })

  it('同一idの出席アラームは重複予約しない（前期・後期に同じ通年科目）', () => {
    const one: AttendanceAlarm = {
      kind: 'attendance-start',
      courseCode: 'Y',
      courseName: '通年科目',
      day: 'mon',
      period: 1,
      fireAt: iso(1, 9),
    }
    // 前期テーブルと後期テーブルの両方に同じ科目＝完全に同一のアラームが2件できる
    const plan = planNotifications([one, { ...one }], [], now)
    expect(plan.attendance).toHaveLength(1)
  })
})
