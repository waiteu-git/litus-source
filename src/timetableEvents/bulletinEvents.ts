import type { BulletinItem } from '../storage/bulletinDigestSerialize'
import { firstCourseCode } from '../parsers/courseCode'
import { makeClassEventId, type ClassEvent } from './classEvent'

/** 掲示本文から起こす「各回イベント候補」。単日のみ。makeup は「休講&補講」掲示の内包補講。 */
export type BulletinEventCandidate = {
  courseCode: string | null
  courseName: string
  type: 'cancel' | 'makeup' | 'roomChange'
  date: string // 'YYYY-MM-DD'
  periods: number[]
  room: string | null
  makeup: { date: string; periods: number[]; room: string | null } | null
  sourceBulletinId: string
}

export type CandidateState = 'new' | 'added' | 'makeupAppend'

export type CandidateView = {
  candidate: BulletinEventCandidate
  state: CandidateState
  matchedEventId: string | null
}

const SCHEDULE = /休講|補講|教室変更/

function typeOf(category: string): BulletinEventCandidate['type'] | null {
  const c = category.replace(/\s+/g, '')
  if (c.includes('教室変更')) return 'roomChange'
  if (c.includes('補講') && !c.includes('休講')) return 'makeup'
  if (c.includes('休講')) return 'cancel'
  return null
}

/** 全角数字→半角。 */
function toHalf(s: string): string {
  return s.replace(/[０-９]/g, (d) => String('０１２３４５６７８９'.indexOf(d)))
}

/** 本文テキストから「ラベル：値」の値を取る（全角コロン）。無ければ null。 */
function labelValue(text: string, label: string): string | null {
  for (const line of text.split('\n')) {
    const m = line.match(new RegExp(`^\\s*${label}\\s*[:：]\\s*(.+)$`))
    if (m) return m[1].trim()
  }
  return null
}

function parseDate(s: string): string | null {
  const m = s.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

function parsePeriods(s: string): number[] {
  const m = toHalf(s).match(/(\d+(?:・\d+)*)\s*限/)
  if (!m) return []
  return m[1].split('・').map((x) => Number(x)).filter((n) => Number.isFinite(n))
}

/** 日付行（例「2026/09/23(水)３限　1211教室」）から date/periods/末尾教室 を取る。 */
function parseDateLine(value: string): { date: string; periods: number[]; room: string | null } | null {
  const date = parseDate(value)
  const periods = parsePeriods(value)
  if (!date || periods.length === 0) return null
  // 「…限」より後ろに残るテキストを教室とみなす（全角空白/空白を除いて非空なら）。
  const after = toHalf(value).split(/限/).slice(1).join('限').replace(/^[\s　]+/, '').trim()
  return { date, periods, room: after || null }
}

/**
 * 掲示本文（body）から各回イベント候補を起こす（純粋・RN非依存）。
 * 型は body.category 優先→無ければ item.category。単日が読めなければ候補ゼロ（確度ゲート）。
 */
export function parseBulletinEvents(item: BulletinItem): BulletinEventCandidate[] {
  const body = item.body
  if (!body) return []
  const category = body.category || item.category
  if (!SCHEDULE.test(category.replace(/\s+/g, ''))) return []
  const type = typeOf(category)
  if (!type) return []
  const text = body.text || ''

  // 授業名：{code} {name}
  const kmg = labelValue(text, '授業名')
  const courseCode = kmg ? firstCourseCode(kmg) : null
  const courseName = kmg ? (courseCode ? kmg.replace(courseCode, '').trim() : kmg.trim()) : ''

  const dateLabel = type === 'cancel' ? '休講日' : type === 'makeup' ? '補講日' : '教室変更日'
  const dv = labelValue(text, dateLabel)
  const main = dv ? parseDateLine(dv) : null
  if (!main) return []

  let room: string | null = null
  let makeup: BulletinEventCandidate['makeup'] = null
  if (type === 'makeup') {
    room = main.room ?? labelValue(text, '教室')
  } else if (type === 'roomChange') {
    room = labelValue(text, '変更後教室')
  } else if (type === 'cancel') {
    // 休講&補講: 補講日行があれば内包補講にする
    const mv = labelValue(text, '補講日')
    const mk = mv ? parseDateLine(mv) : null
    if (mk) makeup = { date: mk.date, periods: mk.periods, room: mk.room }
  }

  return [{
    courseCode,
    courseName,
    type,
    date: main.date,
    periods: main.periods,
    room,
    makeup,
    sourceBulletinId: item.id,
  }]
}

const norm = (s: string) => s.replace(/[\s　]/g, '')
const periodsKey = (p: number[]) => [...p].sort((a, b) => a - b).join(',')

/** 候補と既存イベントが同一授業・同一種別・同日・同コマか。コードがあればコード、無ければ名称で突合。 */
function sameSlot(c: BulletinEventCandidate, e: ClassEvent): boolean {
  if (c.type !== e.type || c.date !== e.date || periodsKey(c.periods) !== periodsKey(e.periods)) return false
  if (c.courseCode && e.courseCode) return c.courseCode === e.courseCode
  return norm(c.courseName) === norm(e.courseName)
}

/**
 * 候補を既存 ClassEvent と突合して状態（new/added/makeupAppend）を付ける（純粋）。
 * makeupAppend = 「休講&補講」候補の cancel 部分が、補講未確定の既存休講に一致した時。
 */
export function reconcileCandidates(candidates: BulletinEventCandidate[], existing: ClassEvent[]): CandidateView[] {
  return candidates.map((candidate) => {
    const match = existing.find((e) => sameSlot(candidate, e))
    if (!match) return { candidate, state: 'new' as const, matchedEventId: null }
    if (candidate.makeup && match.type === 'cancel' && match.makeupStatus !== 'has') {
      return { candidate, state: 'makeupAppend' as const, matchedEventId: match.id }
    }
    return { candidate, state: 'added' as const, matchedEventId: match.id }
  })
}

/** 候補→ClassEvent。休講&補講は makeupStatus='has'＋makeup、単独休講は 'undecided'。ID決定論。 */
export function candidateToClassEvent(candidate: BulletinEventCandidate, createdAt: string): ClassEvent {
  const ev: ClassEvent = {
    id: makeClassEventId({ createdAt, courseName: candidate.courseName, type: candidate.type, date: candidate.date }),
    courseName: candidate.courseName,
    courseCode: candidate.courseCode,
    type: candidate.type,
    date: candidate.date,
    periods: candidate.periods,
    room: candidate.type === 'cancel' ? null : candidate.room,
    note: null,
    createdAt,
  }
  if (candidate.type === 'cancel') {
    if (candidate.makeup) {
      ev.makeupStatus = 'has'
      ev.makeup = candidate.makeup
    } else {
      ev.makeupStatus = 'undecided'
    }
  }
  return ev
}
