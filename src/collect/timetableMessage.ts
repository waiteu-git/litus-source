import {
  parseTimetable,
  parsePeriodTimes,
  type TimetableSlot,
  type CampusPeriodTimes,
} from '../parsers/timetable'

/** 1つの time table テーブル（学期）分の構造化結果 */
export type TimetableCollection = {
  slots: TimetableSlot[]
  periodTimes: CampusPeriodTimes | null
}

export type CollectionResult = {
  collections: TimetableCollection[]
  error: string | null
}

const PARSE_ERROR = 'メッセージを解析できませんでした'
const NO_TABLE_ERROR = '時間割テーブルが見つかりませんでした'
const EMPTY_ERROR = '時間割を読み取れませんでした'

/**
 * WebViewの postMessage ペイロードを構造化する。
 * CLASSは学期「すべて」で前期・後期を別々の table.classTable として描画するため、
 * 注入JSは全テーブルを配列 `tables` で渡す（旧形式の単数 `table` も後方互換で受ける）。
 * パース判断はここ（RN側）に集約し、注入JSはテキスト抽出だけに保つ。
 */
export function parseCollectionMessage(raw: string): CollectionResult {
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return { collections: [], error: PARSE_ERROR }
  }
  if (typeof payload !== 'object' || payload === null) {
    return { collections: [], error: PARSE_ERROR }
  }

  const p = payload as { tables?: unknown; table?: unknown; jigen?: unknown }
  const tables: string[] = []
  if (Array.isArray(p.tables)) {
    for (const t of p.tables) {
      if (typeof t === 'string' && t.trim()) tables.push(t)
    }
  } else if (typeof p.table === 'string' && p.table.trim()) {
    tables.push(p.table)
  }
  if (tables.length === 0) {
    return { collections: [], error: NO_TABLE_ERROR }
  }

  const jigen = typeof p.jigen === 'string' ? p.jigen : ''
  const periodTimes = jigen.trim() ? parsePeriodTimes(jigen) : null

  const collections: TimetableCollection[] = tables.map((t) => ({
    slots: parseTimetable(t),
    periodTimes,
  }))

  const anySlots = collections.some((c) => c.slots.length > 0)
  return { collections, error: anySlots ? null : EMPTY_ERROR }
}
