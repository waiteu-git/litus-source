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
