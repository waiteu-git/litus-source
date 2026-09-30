import type { ClassEvent, ClassEventType } from './classEvent'

const LABEL: Record<ClassEventType, string> = {
  cancel: '休講', makeup: '補講', roomChange: '教室変更', quiz: '小テスト', midterm: '中間', final: '期末', other: 'その他',
}
export function eventTypeLabel(type: ClassEventType): string {
  return LABEL[type]
}

export function shortDate(dateYmd: string): string {
  const m = dateYmd.match(/^\d{4}-(\d{2})-(\d{2})$/)
  return m ? `${Number(m[1])}/${Number(m[2])}` : dateYmd
}

/** 時間割コマ用のバッジ文言。休講は補講状態も付記する。 */
export function cellBadgeText(event: ClassEvent): string {
  const d = shortDate(event.date)
  if (event.type === 'roomChange') return `教室変更→${event.room ?? ''} ${d}`.trim()
  if (event.type === 'cancel') {
    const s = event.makeupStatus
    const tail = s === 'has' && event.makeup ? `補講 ${shortDate(event.makeup.date)}` : s === 'none' ? '補講なし' : '補講未定'
    return `休講 ${d} ・ ${tail}`
  }
  return `${eventTypeLabel(event.type)} ${d}`
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

/** 曜日つきの短い日付（例: 9/23(水)）。実在しない日付・形式違いはそのまま返す。 */
export function shortDateWithWeekday(dateYmd: string): string {
  const m = dateYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return dateYmd
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return dateYmd
  return `${mo}/${d}(${WEEKDAYS[dt.getDay()]})`
}

const periodsText = (periods: number[]) => `${[...periods].sort((a, b) => a - b).join('・')}限`

/** 「追加済みの補講から選ぶ」の行の文言（例: 9/23(水) 3限・野：1211教室）。 */
export function makeupPickRowText(e: { date: string; periods: number[]; room: string | null }): string {
  return `${shortDateWithWeekday(e.date)} ${periodsText(e.periods)}${e.room ? `・${e.room}` : ''}`
}

/** 同じ行の読み上げ名。名詞で終える（「選択中」の状態と重複して読まれない）。メモは見た目では2行目に出るので「メモあり」だけ添える。 */
export function makeupPickA11yLabel(e: { date: string; periods: number[]; room: string | null; note?: string | null }): string {
  const m = e.date.match(/^\d{4}-(\d{2})-(\d{2})$/)
  const d = m ? `${Number(m[1])}月${Number(m[2])}日` : e.date
  return `${d} ${periodsText(e.periods)}${e.room ? ` ${e.room}` : ''} の補講${e.note?.trim() ? '（メモあり）' : ''}`
}
