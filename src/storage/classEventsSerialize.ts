import {
  EXAM_LEAD_DAYS,
  type ClassEvent,
  type ClassEventType,
  type CountdownStart,
  type ExamLeadDays,
  type MakeupStatus,
} from '../timetableEvents/classEvent'
import { isValidHm, isValidYmd } from '../timetableEvents/eventDateValue'

const TYPES: ClassEventType[] = ['cancel', 'makeup', 'roomChange', 'quiz', 'midterm', 'final', 'other']
const STATUSES: MakeupStatus[] = ['has', 'none', 'undecided']

export function serializeClassEvents(events: ClassEvent[]): string {
  return JSON.stringify(events)
}

function numArray(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : []
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

/**
 * 試験ごとの表示開始。形が正しい時だけ返す（壊れていれば undefined＝フィールドだけ落として予定は残す）。
 * 'days' は 60/30/14/7 のどれか、'at' は実在する 'YYYY-MM-DD' と 'HH:mm'。
 * 試験日との前後はここでは見ない（判定の examCountdown が見る＝壊れた値は全体の設定に従う）。
 */
function countdownStartOf(v: unknown): CountdownStart | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const o = v as Record<string, unknown>
  if (o.kind === 'days') {
    return (EXAM_LEAD_DAYS as readonly unknown[]).includes(o.days) ? { kind: 'days', days: o.days as ExamLeadDays } : undefined
  }
  if (o.kind === 'at') {
    return typeof o.date === 'string' && isValidYmd(o.date) && typeof o.time === 'string' && isValidHm(o.time)
      ? { kind: 'at', date: o.date, time: o.time }
      : undefined
  }
  return undefined
}

export function deserializeClassEvents(raw: string | null): ClassEvent[] {
  if (!raw) return []
  let arr: unknown
  try {
    arr = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  const out: ClassEvent[] = []
  for (const it of arr) {
    if (typeof it !== 'object' || it === null) continue
    const o = it as Record<string, unknown>
    if (!str(o.id) || !str(o.courseName) || !TYPES.includes(o.type as ClassEventType) || !str(o.date)) continue
    const e: ClassEvent = {
      id: str(o.id),
      courseName: str(o.courseName),
      courseCode: strOrNull(o.courseCode),
      type: o.type as ClassEventType,
      date: str(o.date),
      periods: numArray(o.periods),
      room: strOrNull(o.room),
      note: strOrNull(o.note),
      createdAt: str(o.createdAt),
    }
    if (STATUSES.includes(o.makeupStatus as MakeupStatus)) e.makeupStatus = o.makeupStatus as MakeupStatus
    const mk = o.makeup as Record<string, unknown> | null | undefined
    if (mk && typeof mk === 'object') {
      e.makeup = { date: str(mk.date), periods: numArray(mk.periods), room: strOrNull(mk.room) }
    } else if (o.makeup === null) {
      e.makeup = null
    }
    // 🔴 既知のフィールドだけで組み直しているので、ここで拾わないと、別の予定を1件保存・削除しただけで
    // 全試験の表示開始が消える（mutateClassEvents は全件を読み込み→書き戻す＝設計 A 禁止事項3）。
    const cs = countdownStartOf(o.countdownStart)
    if (cs) e.countdownStart = cs
    out.push(e)
  }
  return out
}
