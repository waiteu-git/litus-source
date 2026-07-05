import { parse, type HTMLElement } from 'node-html-parser'

export type TimetableClass = {
  courseCode: string
  name: string
  teachers: string[]
  room: string
  isRemote: boolean
  credits: number | null
  badges: string[]
}
export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'
export type TimetableSlot = { day: DayOfWeek; period: number; classes: TimetableClass[] }
export type PeriodTime = { period: number; start: string; end: string }
export type CampusPeriodTimes = { campus: string; periods: PeriodTime[] }

export function parseClassCell(cellHtml: string): TimetableClass | null {
  const root = parse(cellHtml)
  const cell = root.querySelector('.jugyo-info') ?? root
  if (cell.classList.contains('noClass')) return null

  const nameEl = cell.querySelector('.fontB')
  if (!nameEl) return null
  const name = nameEl.text.trim()
  if (!name) return null

  const codeMatch = cell.text.match(/\b\d{7}\b/)
  const courseCode = codeMatch ? codeMatch[0] : ''

  const roomEl = cell.querySelector('span')
  const room = roomEl ? roomEl.text.trim() : ''
  const isRemote = room.includes('遠隔')

  const taniEl = cell.querySelector('.taniSu')
  let credits: number | null = null
  if (taniEl) {
    const m = taniEl.text.match(/([\d.]+)\s*単位/)
    if (m) credits = Number(m[1])
  }

  const badges = cell
    .querySelectorAll('.signClass')
    .map((b: HTMLElement) => b.text.trim())
    .filter((t: string) => t.length > 0)

  const teachers = extractTeachers(cell, name, courseCode)

  return { courseCode, name, teachers, room, isRemote, credits, badges }
}

function extractTeachers(cell: HTMLElement, name: string, courseCode: string): string[] {
  const divs = cell.querySelectorAll('div')
  for (const d of divs) {
    if (d.classList.contains('fontB')) continue
    if (d.classList.contains('taniSu')) continue
    if (d.classList.contains('sign')) continue
    if (d.querySelector('span')) continue
    if (d.querySelector('button')) continue
    if (d.querySelector('div')) continue
    const t = d.text.trim()
    if (!t) continue
    if (t === name) continue
    if (t === courseCode) continue
    if (/^\d{7}$/.test(t)) continue
    if (/単位/.test(t)) continue
    if (t.includes('ui-button')) continue
    return t.split(/[　\s]+/).filter((x) => x.length > 0)
  }
  return []
}
