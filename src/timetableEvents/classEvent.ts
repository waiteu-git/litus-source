export type ClassEventType = 'cancel' | 'makeup' | 'roomChange' | 'quiz' | 'midterm' | 'final' | 'other'
export type MakeupStatus = 'has' | 'none' | 'undecided'
export type MakeupInfo = { date: string; periods: number[]; room: string | null }

/**
 * 時間割の各回の授業に付与するイベント（休講/補講/教室変更/小テスト/中間/期末/その他）。
 * 常に単一日付。連続コマは periods に複数、片方だけの適用も periods の部分集合で表す。
 * 休講(cancel)は補講の状態(makeupStatus)と内包補講(makeup)を持てる。
 */
export type ClassEvent = {
  id: string
  courseName: string
  courseCode: string | null
  type: ClassEventType
  date: string // 'YYYY-MM-DD'
  periods: number[]
  room: string | null
  note: string | null
  createdAt: string
  makeupStatus?: MakeupStatus
  makeup?: MakeupInfo | null
}

export type MakeupOccurrence = {
  courseName: string
  date: string
  periods: number[]
  room: string | null
  sourceId: string
}

/** 休講内包の補講(makeupStatus=has)＋単独補講(type=makeup) を「補講オカレンス」に平坦化する。 */
export function makeupOccurrences(events: ClassEvent[]): MakeupOccurrence[] {
  const out: MakeupOccurrence[] = []
  for (const e of events) {
    if (e.type === 'makeup') {
      out.push({ courseName: e.courseName, date: e.date, periods: e.periods, room: e.room, sourceId: e.id })
    } else if (e.type === 'cancel' && e.makeupStatus === 'has' && e.makeup) {
      out.push({ courseName: e.courseName, date: e.makeup.date, periods: e.makeup.periods, room: e.makeup.room, sourceId: e.id })
    }
  }
  return out
}

/** 決定論的なID生成（Math.random非依存・seedの簡易ハッシュ）。 */
export function makeClassEventId(seed: { createdAt: string; courseName: string; type: ClassEventType; date: string }): string {
  const s = `${seed.createdAt}|${seed.courseName}|${seed.type}|${seed.date}`
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return `evt_${h.toString(36)}`
}
