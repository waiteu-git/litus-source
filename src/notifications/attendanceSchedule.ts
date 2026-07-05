/**
 * 時間割（収集済み）と時限時刻から出席アラームの発火時刻を計算する純粋関数。
 * 二層アラームの「層1（時間割ベースの多点ナッジ）」用。授業開始と終了◯分前の2点を出す。
 * expo-notifications への予約は notifier.ts が本結果を使う（本モジュールは端末非依存・now注入で決定論的）。
 * 仕様: docs/superpowers/specs/2026-07-05-v2.0.0-class-integration-design.md「出席アラーム設計」。
 */
import type { DayOfWeek } from '../parsers/timetable'
import type { TimetableCollection } from '../collect/timetableMessage'

export type AttendanceAlarmKind = 'attendance-start' | 'attendance-last-chance'

export type AttendanceAlarm = {
  kind: AttendanceAlarmKind
  courseCode: string
  courseName: string
  day: DayOfWeek
  period: number
  fireAt: string
}

/** courseCode -> 有効。キー不在は「有効」とみなす（既定ON）。false のみ無効。 */
export type AttendanceAlarmSettings = Record<string, boolean>

export type AttendanceAlarmOptions = {
  /** 何日先まで予約するか。既定7日。 */
  daysAhead?: number
  /** ラストチャンス通知を授業終了の何分前に出すか。既定10分。 */
  lastChanceLeadMinutes?: number
}

const WEEKDAY: Record<DayOfWeek, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }

function atLocalTime(base: Date, hhmm: string): Date | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), Number(m[1]), Number(m[2]), 0, 0)
}

export function computeAttendanceAlarms(
  collections: TimetableCollection[],
  settings: AttendanceAlarmSettings,
  now: Date,
  options: AttendanceAlarmOptions = {},
): AttendanceAlarm[] {
  const daysAhead = options.daysAhead ?? 7
  const lead = options.lastChanceLeadMinutes ?? 10
  const alarms: AttendanceAlarm[] = []

  for (let i = 0; i < daysAhead; i++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 0, 0, 0, 0)
    const weekday = date.getDay()

    for (const col of collections) {
      const periods = col.periodTimes?.periods ?? []
      for (const slot of col.slots) {
        if (WEEKDAY[slot.day] !== weekday) continue
        const pt = periods.find((p) => p.period === slot.period)
        if (!pt) continue
        const start = atLocalTime(date, pt.start)
        const end = atLocalTime(date, pt.end)
        for (const c of slot.classes) {
          if (settings[c.courseCode] === false) continue
          if (start && start.getTime() > now.getTime()) {
            alarms.push({
              kind: 'attendance-start',
              courseCode: c.courseCode,
              courseName: c.name,
              day: slot.day,
              period: slot.period,
              fireAt: start.toISOString(),
            })
          }
          if (end) {
            const lc = new Date(end.getTime() - lead * 60 * 1000)
            if (lc.getTime() > now.getTime()) {
              alarms.push({
                kind: 'attendance-last-chance',
                courseCode: c.courseCode,
                courseName: c.name,
                day: slot.day,
                period: slot.period,
                fireAt: lc.toISOString(),
              })
            }
          }
        }
      }
    }
  }

  alarms.sort((a, b) => new Date(a.fireAt).getTime() - new Date(b.fireAt).getTime())
  return alarms
}

export function buildAttendanceNotificationContent(alarm: AttendanceAlarm): { title: string; body: string } {
  const title = `${alarm.courseName} 出席コード`
  const body =
    alarm.kind === 'attendance-start'
      ? `${alarm.courseName}の出席コードが入力できるか確認しましょう`
      : `${alarm.courseName}の出席、まだなら今のうちに入力しましょう`
  return { title, body }
}
