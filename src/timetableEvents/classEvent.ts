export type ClassEventType = 'cancel' | 'makeup' | 'roomChange' | 'quiz' | 'midterm' | 'final' | 'other'
export type MakeupStatus = 'has' | 'none' | 'undecided'
export type MakeupInfo = { date: string; periods: number[]; room: string | null }

/** 試験カウントダウンの「N日前から」の日数（設定＞表示と予定フォームで共通の4択）。 */
export type ExamLeadDays = 60 | 30 | 14 | 7
export const EXAM_LEAD_DAYS: readonly ExamLeadDays[] = [60, 30, 14, 7]

/**
 * 試験ごとの表示開始（ホームの試験カウントダウンに出し始める時期）。フィールドが無い＝全体の設定に従う。
 * 'at' はローカルの 'YYYY-MM-DD' と 'HH:mm'（試験日と同じくローカルの暦で持つ。UTC の ISO にしない）。
 */
export type CountdownStart =
  | { kind: 'days'; days: ExamLeadDays }
  | { kind: 'at'; date: string; time: string }

/**
 * 時間割の各回の授業に付与するイベント（休講/補講/教室変更/小テスト/中間/期末/その他）。
 * 常に単一日付。連続コマは periods に複数、片方だけの適用も periods の部分集合で表す。
 * 休講(cancel)は補講の状態(makeupStatus)と内包補講(makeup)を持てる。
 * 試験(quiz/midterm/final)は表示開始(countdownStart)を持てる。無い＝全体の設定に従う。
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
  /**
   * 試験の時だけ付く表示開始。ホームの試験カウントダウンだけが読む（通知・今日の変更・時間割は読まない＝ラチェット R2）。
   * 🔴 任意フィールドなので tsc は止めない。classEventsSerialize（読み込みの組み直し）と classEventForm（保存・編集読み込み）で必ず運ぶ。
   */
  countdownStart?: CountdownStart
}

export type MakeupOccurrence = {
  courseName: string
  date: string
  periods: number[]
  room: string | null
  sourceId: string
}

export const normCourseName = (s: string) => s.replace(/[\s　]/g, '')
export const periodsKey = (p: number[]) => [...p].sort((a, b) => a - b).join(',')

/** 同一授業か。コードが両方あればコード、無ければ空白除去した名称で比べる。 */
export function sameCourse(
  a: { courseCode: string | null; courseName: string },
  b: { courseCode: string | null; courseName: string },
): boolean {
  if (a.courseCode && b.courseCode) return a.courseCode === b.courseCode
  return normCourseName(a.courseName) === normCourseName(b.courseName)
}

/**
 * 「覆われた単独補講」＝同じ補講（同一授業・同日・同コマ集合）を、補講が確定した休講に内包した補講が持っている
 * 単独補講(type=makeup)。冗長なので内包側を正とする。戻り値は 単独補講の id → 覆う休講の id。
 *
 * 【休講＆補講】の掲示と【補講】の掲示が別々に出ると、候補の突合が種別の一致を要求するため両方が別々に登録され、
 * 補講の発生・通知が二重になっていた（2026-09-29 の本人報告）。データは書き換えず、派生側でここを通して畳む。
 * 表記ゆれで一致しない時は畳まない＝二重が残るだけで、本物の補講が消える誤爆はしない。
 */
export function coveredStandaloneMakeups(events: ClassEvent[]): Map<string, string> {
  const covered = new Map<string, string>()
  const carriers = events.filter((e) => e.type === 'cancel' && e.makeupStatus === 'has' && e.makeup)
  if (carriers.length === 0) return covered
  for (const s of events) {
    if (s.type !== 'makeup') continue
    const carrier = carriers.find(
      (c) => c.makeup!.date === s.date && periodsKey(c.makeup!.periods) === periodsKey(s.periods) && sameCourse(c, s),
    )
    if (carrier) covered.set(s.id, carrier.id)
  }
  return covered
}

/** 教室の突き合わせ。片方 null なら他方。一方が他方を含む（キャンパス接頭辞つき）なら長い方。食い違いは primary。 */
function mergeRoom(primary: string | null, other: string | null): string | null {
  if (!primary) return other
  if (!other || primary === other) return primary
  if (other.endsWith(primary)) return other
  return primary
}

/**
 * 休講内包の補講(makeupStatus=has)＋単独補講(type=makeup) を「補講オカレンス」に平坦化する。
 * 内包補講に覆われた単独補講は出さない（内包側の教室が欠けていれば単独側の教室で補う）。
 */
export function makeupOccurrences(events: ClassEvent[]): MakeupOccurrence[] {
  const covered = coveredStandaloneMakeups(events)
  const byId = new Map(events.map((e) => [e.id, e]))
  const coveredRooms = new Map<string, (string | null)[]>()
  for (const [sid, cid] of covered) {
    const list = coveredRooms.get(cid) ?? []
    list.push(byId.get(sid)?.room ?? null)
    coveredRooms.set(cid, list)
  }
  const out: MakeupOccurrence[] = []
  for (const e of events) {
    if (e.type === 'makeup') {
      if (covered.has(e.id)) continue
      out.push({ courseName: e.courseName, date: e.date, periods: e.periods, room: e.room, sourceId: e.id })
    } else if (e.type === 'cancel' && e.makeupStatus === 'has' && e.makeup) {
      const room = (coveredRooms.get(e.id) ?? []).reduce<string | null>((acc, r) => mergeRoom(acc, r), e.makeup.room)
      out.push({ courseName: e.courseName, date: e.makeup.date, periods: e.makeup.periods, room, sourceId: e.id })
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
