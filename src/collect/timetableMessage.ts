import {
  parseTimetable,
  parsePeriodTimes,
  type TimetableSlot,
  type CampusPeriodTimes,
} from '../parsers/timetable'

export type TimetableCollection = {
  slots: TimetableSlot[]
  periodTimes: CampusPeriodTimes | null
  error: string | null
}

/**
 * WebViewの postMessage ペイロード（JSON文字列 {table, jigen}）を構造化する。
 * パース判断はここ（RN側）に集約し、注入JSはテキスト抽出だけに保つ。
 */
export function parseCollectionMessage(raw: string): TimetableCollection {
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return { slots: [], periodTimes: null, error: 'メッセージを解析できませんでした' }
  }

  if (typeof payload !== 'object' || payload === null) {
    return { slots: [], periodTimes: null, error: 'メッセージを解析できませんでした' }
  }

  const table = typeof (payload as any).table === 'string' ? (payload as any).table : ''
  const jigen = typeof (payload as any).jigen === 'string' ? (payload as any).jigen : ''
  if (!table.trim()) {
    return { slots: [], periodTimes: null, error: '時間割テーブルが見つかりませんでした' }
  }

  const slots = parseTimetable(table)
  const periodTimes = jigen.trim() ? parsePeriodTimes(jigen) : null
  if (slots.length === 0) {
    return { slots: [], periodTimes, error: '時間割を読み取れませんでした' }
  }
  return { slots, periodTimes, error: null }
}
