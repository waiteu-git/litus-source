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
  /**
   * そのテーブルの直前に描かれていた見出し（実測＝「2026年度 前期」）。学期の識別子。
   * 旧い保存データには無いので optional。無い＝識別できないので**絞り込みをしない**側へ倒す
   * （[[semester.pickCurrentSemester]]）。
   */
  label?: string | null
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

  const p = payload as { tables?: unknown; table?: unknown; jigen?: unknown; heads?: unknown }
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

  // heads は tables と同じ並び（注入JSが同じ配列から map する）。長さが違う場合は素直に null。
  const heads = Array.isArray(p.heads) ? p.heads : []
  const collections: TimetableCollection[] = tables.map((t, i) => ({
    slots: parseTimetable(t),
    periodTimes,
    label: typeof heads[i] === 'string' && (heads[i] as string).trim() ? (heads[i] as string) : null,
  }))

  const anySlots = collections.some((c) => c.slots.length > 0)
  return { collections, error: anySlots ? null : EMPTY_ERROR }
}
