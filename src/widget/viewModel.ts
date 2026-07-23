/**
 * ホーム画面ウィジェットの「表示モデル」を計算する純関数（RN 非依存・now 注入で決定論的・vitest 対象）。
 * 保存データ（時間割 / 課題 / 出席済み記録）→ ウィジェット描画に必要な最小限の表示モデルへ変換する。
 *
 * 描画層（react-native-android-widget の FlexWidget 群 / 将来 iOS の updateSnapshot）は
 * この出力をマッピングするだけにして、「何を表示するか」の判断を 100% ここへ寄せる（CLAUDE.md のロジック層分離）。
 * 既存の純関数（pickFocusClass / pickUrgentAssignment / isInClassPeriod / isAttendedNow 等）を再利用する。
 */
import type { TimetableCollection } from '../collect/timetableMessage'
import type { Assignment } from '../storage/assignmentsSerialize'
import type { AttendedRecord } from '../attendance/attendedState'
import type { DayOfWeek, Quarter } from '../parsers/timetable'
import { pickFocusClass } from '../home/focusClass'
import { pickUrgentAssignment, relDue, urgencyTone } from '../assignments/deadline'
import { isInClassPeriod, attendedClassEndMin } from '../attendance/classPeriod'
import { isAttendedNow } from '../attendance/attendedState'
import { representativeClass } from '../timetableEvents/quarter'
import { formatFreshnessTime } from '../health/freshnessText'

const WEEKDAY_JP = ['日', '月', '火', '水', '木', '金', '土']
const WEEKDAY: Record<DayOfWeek, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }

export type WidgetClass = {
  name: string
  period: number
  startText: string
  room: string
  isRemote: boolean
}

export type WidgetNextClass = WidgetClass & {
  /** 進行中（既に開始済み）は null、開始前は now からの分数。 */
  minutesUntil: number | null
}

export type WidgetAssignment = {
  courseName: string
  title: string
  /** 「あとN時間」等の相対表示。 */
  deadlineText: string
  /** 締切 24h 以内（赤トーン相当）。 */
  urgent: boolean
  /** 課題ページURL（タップ導線のディープリンク用）。 */
  url: string
}

export type WidgetAttendance = {
  /** idle=授業時間外 / open=受付中かも（弱い合図） / done=本日この授業に出席済み。 */
  state: 'idle' | 'open' | 'done'
  targetCourse: string | null
}

export type WidgetModel = {
  todayLabel: string
  /** データ取得時刻の鮮度ラベル。未取得は null（描画時刻ではないので再描画では動かない）。 */
  updatedAtLabel: string | null
  nextClass: WidgetNextClass | null
  laterClasses: WidgetClass[]
  nearestAssignment: WidgetAssignment | null
  attendance: WidgetAttendance
}

function hhmmToMin(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** 本日（now の曜日）の授業を開始時刻順に列挙する。時刻の引けないコマは除外。isOn で隔週休みを除ける。 */
function todayClasses(
  collections: TimetableCollection[],
  now: Date,
  isOn?: (courseCode: string) => boolean,
  currentQuarter?: Quarter,
): Array<{ startMin: number; cls: WidgetClass }> {
  const weekday = now.getDay()
  const out: Array<{ startMin: number; cls: WidgetClass }> = []
  for (const col of collections) {
    const periods = col.periodTimes?.periods ?? []
    for (const slot of col.slots) {
      if (slot.classes.length === 0) continue
      if (WEEKDAY[slot.day] !== weekday) continue
      const pt = periods.find((p) => p.period === slot.period)
      if (!pt) continue
      const startMin = hhmmToMin(pt.start)
      if (startMin === null) continue
      const c = representativeClass(slot.classes, currentQuarter)
      if (!c) continue
      if (isOn && !isOn(c.courseCode)) continue
      out.push({
        startMin,
        cls: {
          name: c.name,
          period: slot.period,
          startText: pt.start,
          room: c.room,
          isRemote: c.isRemote,
        },
      })
    }
  }
  return out.sort((a, b) => a.startMin - b.startMin)
}

function fmtTodayLabel(now: Date): string {
  return `${now.getMonth() + 1}/${now.getDate()}（${WEEKDAY_JP[now.getDay()]}）`
}

/**
 * 表示中の各データ源の取得時刻のうち、未取得(0/無効)を除いた最古を返す。全て未取得なら0。
 * ウィジェットは時間割由来と課題由来を同じカードに混ぜて出すため、鮮度は保守的（古い方）に寄せる。
 * ＝時間割だけ新しくても「課題は数日前の情報」であることを隠さない。
 */
export function pickDataAt(...ats: number[]): number {
  const valid = ats.filter((n) => Number.isFinite(n) && n > 0)
  return valid.length === 0 ? 0 : Math.min(...valid)
}

function buildAttendance(
  collections: TimetableCollection[],
  now: Date,
  attended: AttendedRecord | null,
  focusName: string | null,
): WidgetAttendance {
  const classEndMin = attendedClassEndMin(collections, now, attended?.confirmWindow ?? null)
  if (isAttendedNow(attended, now, classEndMin)) {
    return { state: 'done', targetCourse: attended?.courseName ?? null }
  }
  if (isInClassPeriod(collections, now)) {
    return { state: 'open', targetCourse: focusName }
  }
  return { state: 'idle', targetCourse: null }
}

export function buildWidgetModel(
  now: Date,
  timetable: TimetableCollection[],
  assignments: Assignment[],
  attended: AttendedRecord | null,
  /** 隔週で今週休みの授業を除く述語（省略時は常に実施）。 */
  isOn?: (courseCode: string) => boolean,
  currentQuarter?: Quarter,
  /** データを最後に取得した時刻(ms)。0/未指定は未取得＝鮮度ラベルを出さない。 */
  dataAt: number = 0,
): WidgetModel {
  const nowMin = now.getHours() * 60 + now.getMinutes()

  const focus = pickFocusClass(timetable, now, isOn, currentQuarter)
  const nextClass: WidgetNextClass | null = focus
    ? {
        name: focus.name,
        period: focus.period,
        startText: focus.start,
        room: focus.room,
        isRemote: focus.isRemote,
        minutesUntil: focus.isNow ? null : (hhmmToMin(focus.start) ?? nowMin) - nowMin,
      }
    : null

  const focusStartMin = focus ? hhmmToMin(focus.start) : null
  const laterClasses: WidgetClass[] =
    focus && focusStartMin !== null
      ? todayClasses(timetable, now, isOn, currentQuarter)
          .filter((e) => e.startMin > nowMin && e.startMin > focusStartMin)
          .slice(0, 2)
          .map((e) => e.cls)
      : []

  const urgent = pickUrgentAssignment(assignments, now)
  const nearestAssignment: WidgetAssignment | null = urgent
    ? {
        courseName: urgent.courseName,
        title: urgent.title,
        deadlineText: relDue(urgent.deadline, now),
        urgent: urgencyTone(urgent, now) === 'red',
        url: urgent.url,
      }
    : null

  return {
    todayLabel: fmtTodayLabel(now),
    updatedAtLabel: formatFreshnessTime(dataAt, now),
    nextClass,
    laterClasses,
    nearestAssignment,
    attendance: buildAttendance(timetable, now, attended, focus?.name ?? null),
  }
}
