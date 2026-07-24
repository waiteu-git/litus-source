import { makeupOccurrences, type ClassEvent, type ClassEventType, type MakeupOccurrence } from './classEvent'

const p2 = (n: number) => String(n).padStart(2, '0')
export function todayKey(now: Date): string {
  return `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`
}

/**
 * 時間割セル（cellDate の曜日 × period）に表示するイベント。日付は **完全一致**で引く。
 *
 * 「当日以降で最も近い1件」を返していた頃は、期末など先のイベントが発生週より前の全週の
 * 同じコマにバッジとして出ていた（休講・教室変更も同様）。先の予定の予告はホームの
 * 試験カウントダウン／「今日の変更」が担うので、時間割セルはその週のその日だけでよい。
 *
 * 過去日でも一致すれば返す。時間割は週を明示的に選んで見るUIで、過去週も遡れる（休講は
 * 起きた事実として残す）。隔週の薄表示 isClassOnDate も過去週を同じ扱いにしている。
 *
 * 補講(単独 type='makeup')は対象外（補講日は別導線で出す）。無ければ null。
 */
export function pickCellEvent(events: ClassEvent[], courseName: string, period: number, cellDate: Date): ClassEvent | null {
  const key = todayKey(cellDate)
  return events.find((e) => e.courseName === courseName && e.periods.includes(period) && e.date === key && e.type !== 'makeup') ?? null
}

/** date が当日のイベント。 */
export function todayEvents(events: ClassEvent[], now: Date): ClassEvent[] {
  const today = todayKey(now)
  return events.filter((e) => e.date === today)
}

/** 「今日の予定」1件分（表示に必要な内部データのみを平坦化した中立形）。 */
export type TodayScheduleItem = {
  /** 表示区分。直接イベントはその type、補講は 'makeup'。 */
  kind: ClassEventType
  courseName: string
  periods: number[]
  room: string | null
  note: string | null
}

/**
 * ホーム「今やること」に集約する当日の内部予定。
 * 直接イベント（休講/教室変更/小テスト/中間/期末/その他）＋補講オカレンス（休講内包・単独の双方を
 * makeupOccurrences で一元化）を当日分だけ抽出する。単独補講(type='makeup')は補講オカレンス側へ寄せ、
 * 直接イベント側からは除外して二重表示を防ぐ。
 *
 * 集約対象は内部データ（授業・補講・課題・掲示）のみ。天気などの外部データは通信先制約
 * （LETUS/CLASS/自前バックエンドのみ許可＝CLAUDE.md）に抵触するため意図的に扱わない。
 */
export function todaySchedule(events: ClassEvent[], now: Date): TodayScheduleItem[] {
  const today = todayKey(now)
  const items: TodayScheduleItem[] = []
  for (const e of events) {
    if (e.date !== today) continue
    if (e.type === 'makeup') continue // 補講は下で occurrence として一元化（重複防止）
    items.push({ kind: e.type, courseName: e.courseName, periods: e.periods, room: e.room, note: e.note })
  }
  for (const m of makeupOccurrences(events)) {
    if (m.date !== today) continue
    items.push({ kind: 'makeup', courseName: m.courseName, periods: m.periods, room: m.room, note: null })
  }
  return items
}

/** 当日以降の補講オカレンスを日付昇順で。 */
export function upcomingMakeups(events: ClassEvent[], now: Date): MakeupOccurrence[] {
  const today = todayKey(now)
  return makeupOccurrences(events)
    .filter((m) => m.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}
