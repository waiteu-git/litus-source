import { parse, type HTMLElement } from 'node-html-parser'
import { firstCourseCode } from './courseCode'
import type { DayOfWeek } from './timetable'

export type AttendanceMark =
  | 'present' | 'absent' | 'late' | 'earlyLeave' | 'official'
  | 'canceled' | 'notInScope' | 'examNotInScope' | 'none'
export type AttendanceSession = { date: string | null; mark: AttendanceMark }
export type AttendanceSlot = { day: DayOfWeek; period: number }
export type AttendanceCourseStats = {
  courseCode: string | null
  courseName: string
  slots: AttendanceSlot[]
  ratePercent: number | null
  sessions: AttendanceSession[]
}

const DAY_BY_KANJI: Record<string, DayOfWeek> = {
  月: 'mon', 火: 'tue', 水: 'wed', 木: 'thu', 金: 'fri', 土: 'sat',
}

// 記号→区分。ページ内凡例に対応。空セルは全角スペースまたは空文字で 'none'。
const MARK_BY_GLYPH: Record<string, AttendanceMark> = {
  '〇': 'present', '×': 'absent', '△': 'late', '▽': 'earlyLeave',
  '公': 'official', '休': 'canceled', '－': 'notInScope', '外': 'examNotInScope',
}

/** 曜日時限テキスト（例 "月1 金3"）を slots に。 */
function parseSlots(text: string): AttendanceSlot[] {
  const out: AttendanceSlot[] = []
  for (const tok of text.split(/\s+/).map((t) => t.trim()).filter(Boolean)) {
    const day = DAY_BY_KANJI[tok[0]]
    const period = Number(tok.slice(1))
    if (day && Number.isFinite(period)) out.push({ day, period })
  }
  return out
}

/** 本体テーブル = tbody に td.colSizeFixed（各回列）を持つ表。複製（3列のみ）は除外。 */
function findBodyTable(root: HTMLElement): HTMLElement | null {
  for (const t of root.querySelectorAll('table')) {
    if (t.querySelector('tbody tr td.colSizeFixed')) return t
  }
  return null
}

export function parseAttendanceStats(html: string): AttendanceCourseStats[] {
  const root = parse(html)
  const table = findBodyTable(root)
  if (!table) return []

  const out: AttendanceCourseStats[] = []
  for (const row of table.querySelectorAll('tbody > tr')) {
    const yobi = row.querySelector('td.colSizeYobiJigen')
    const nameCell = row.querySelector('td.colSizeBetterLong')
    if (!yobi || !nameCell) continue

    const slots = parseSlots(yobi.text)
    const courseCode = firstCourseCode(nameCell.text)
    const courseName = nameCell.text
      .replace(courseCode ?? '', '')
      .replace(/\s+/g, ' ')
      .trim()

    const rateText = row.querySelector('td.colSizeRate')?.text.trim() ?? ''
    const rateMatch = rateText.match(/(\d+)/)
    const ratePercent = rateMatch ? Number(rateMatch[1]) : null

    const sessions: AttendanceSession[] = row.querySelectorAll('td.colSizeFixed').map((cell) => {
      const glyph = cell.querySelector('.syuketsuKbnMark')?.text.trim() ?? ''
      const date = cell.querySelector('.jugyoDate')?.text.trim() ?? ''
      return { date: date || null, mark: MARK_BY_GLYPH[glyph] ?? 'none' }
    })

    out.push({ courseCode, courseName, slots, ratePercent, sessions })
  }
  return out
}
