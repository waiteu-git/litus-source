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

/**
 * 休講が登録されているコマ（アラームを出さない対象）。ClassEvent から必要な分だけ写した形。
 *
 * これが無かった頃は、休講を登録しても**同じ日に「◯◯ 休講」と「◯◯ 出席コード」が両方届いていた**
 * （当日8:00に休講通知 → 授業開始時刻と終了10分前に出席アラーム2通・後者はMAXチャンネル）。
 * ホーム画面は同じ日に「休講」タグを出しており、UI表示と通知が食い違っていた（2026-07-17修正）。
 */
export type CancelledClass = {
  /** 'YYYY-MM-DD'。 */
  date: string
  /** 休講の時限。連続コマの一部だけ休講もありうるので配列で持つ。 */
  periods: number[]
  /** 掲示由来のイベントは courseCode を引けないことがある（その場合は名前で照合する）。 */
  courseCode: string | null
  courseName: string
}

const p2 = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`

/**
 * その日・その科目・その時限が休講か。
 * **科目で必ず絞る**（日付と時限だけで判定すると同じ時限の別科目まで巻き込んで通知を消す）。
 * courseCode があればそれで、無ければ科目名で照合する。どちらでも引けなければ false
 * ＝**アラームを出す側に倒す**（休講の判定を外して通知を殺すより、余分に鳴るほうが安全）。
 */
function isCancelled(
  cancelled: CancelledClass[],
  dateKey: string,
  courseCode: string,
  courseName: string,
  period: number,
): boolean {
  return cancelled.some(
    (c) =>
      c.date === dateKey &&
      c.periods.includes(period) &&
      (c.courseCode ? c.courseCode === courseCode : c.courseName === courseName),
  )
}

const WEEKDAY: Record<DayOfWeek, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }

function atLocalTime(base: Date, hhmm: string): Date | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), Number(m[1]), Number(m[2]), 0, 0)
}

/**
 * 昇順の時限番号を「連続する塊」へ分ける（[4,5,7] -> [[4,5],[7]]）。
 * CLASSの時間割は**連続コマを時限ごとの別セルで返す**ため、素直にslot単位でアラームを作ると
 * 1回の授業（例: 物理学実験Ａ 火4-5限＝14:40〜17:50）に開始/終了前が2組＝**4通**届く。
 * しかも16:00「まだなら今のうちに」と16:20「入力できるか確認しましょう」が実験の最中に20分間隔で
 * 鳴る（どちらもMAXチャンネル＝音＋ヘッドアップ）。塊にまとめて開始1通・終了前1通にする。
 */
export function consecutiveRuns(periods: number[]): number[][] {
  const sorted = [...new Set(periods)].sort((a, b) => a - b)
  const runs: number[][] = []
  for (const p of sorted) {
    const last = runs[runs.length - 1]
    if (last && p === last[last.length - 1] + 1) last.push(p)
    else runs.push([p])
  }
  return runs
}

export function computeAttendanceAlarms(
  collections: TimetableCollection[],
  settings: AttendanceAlarmSettings,
  now: Date,
  options: AttendanceAlarmOptions = {},
  /** 休講登録済みのコマ。渡さなければ従来どおり全コマにアラームを出す。 */
  cancelled: CancelledClass[] = [],
): AttendanceAlarm[] {
  const daysAhead = options.daysAhead ?? 7
  const lead = options.lastChanceLeadMinutes ?? 10
  const alarms: AttendanceAlarm[] = []

  for (let i = 0; i < daysAhead; i++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 0, 0, 0, 0)
    const weekday = date.getDay()
    const dateKey = ymd(date)

    for (const col of collections) {
      const periods = col.periodTimes?.periods ?? []
      // その曜日の「科目 × 時限」を集める。**同日・同一科目の連続コマは1セッション**として扱うため、
      // slot単位ではなく科目単位でいったん束ねる。曜日でまず絞るので、別の曜日にある同じ科目
      // （例: 基礎電気数学及び演習が月1と金3）は別授業回として当然に分かれる。
      const byCourse = new Map<string, { name: string; day: DayOfWeek; periods: number[] }>()
      for (const slot of col.slots) {
        if (WEEKDAY[slot.day] !== weekday) continue
        // 時限時刻が無い時限は開始/終了を出せないので、束ねる前に落とす
        // （落とさないと [4,5] の5だけ時刻不明のとき塊の終端が壊れる）。
        if (!periods.some((p) => p.period === slot.period)) continue
        for (const c of slot.classes) {
          if (settings[c.courseCode] === false) continue
          const cur = byCourse.get(c.courseCode)
          if (cur) cur.periods.push(slot.period)
          else byCourse.set(c.courseCode, { name: c.name, day: slot.day, periods: [slot.period] })
        }
      }

      for (const [courseCode, e] of byCourse) {
        // 休講のコマを落としてから塊にする。連続コマの一部だけ休講なら、残りのコマで塊を組み直す
        // （例: 4-5限のうち5限だけ休講 → 4限だけの授業として開始/終了前を出す）。
        const active = e.periods.filter((p) => !isCancelled(cancelled, dateKey, courseCode, e.name, p))
        for (const run of consecutiveRuns(active)) {
          const firstPt = periods.find((p) => p.period === run[0])
          const lastPt = periods.find((p) => p.period === run[run.length - 1])
          if (!firstPt || !lastPt) continue
          // 塊の先頭の開始〜末尾の終了が「その授業1回」の実時間帯。
          const start = atLocalTime(date, firstPt.start)
          const end = atLocalTime(date, lastPt.end)
          if (start && start.getTime() > now.getTime()) {
            alarms.push({
              kind: 'attendance-start',
              courseCode,
              courseName: e.name,
              day: e.day,
              period: run[0],
              fireAt: start.toISOString(),
            })
          }
          if (end) {
            const lc = new Date(end.getTime() - lead * 60 * 1000)
            if (lc.getTime() > now.getTime()) {
              alarms.push({
                kind: 'attendance-last-chance',
                courseCode,
                courseName: e.name,
                day: e.day,
                period: run[0],
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
