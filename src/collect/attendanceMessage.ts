/**
 * 出席ページの受付状態を注入JSのpostMessageから判定する純粋関数。
 * 注入JSは受付表示領域のテキスト（と可能なら科目名）を渡すだけで、判定はここに集約する。
 */
export type AttendanceReception = {
  accepting: boolean
  courseName: string | null
  confirmWindow: string | null
  remaining: string | null
  error: string | null
}

const NONE_MARKER = '出席確認中の履修授業はありません'
const PARSE_ERROR = 'メッセージを解析できませんでした'
const READ_ERROR = '出席受付状況を読み取れませんでした'

function fail(error: string): AttendanceReception {
  return { accepting: false, courseName: null, confirmWindow: null, remaining: null, error }
}

function extractWindow(text: string): string | null {
  const m = text.match(/出席確認時間[:：]?\s*(\d{1,2}:\d{2})\s*[〜~～]\s*(\d{1,2}:\d{2})/)
  return m ? `${m[1]}〜${m[2]}` : null
}

function extractRemaining(text: string): string | null {
  const m = text.match(/あと\s*([0-9]+分[0-9]+秒|[0-9]+分|[0-9]+秒)/)
  return m ? `あと${m[1]}` : null
}

export function parseAttendanceMessage(raw: string): AttendanceReception {
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return fail(PARSE_ERROR)
  }
  if (typeof payload !== 'object' || payload === null) return fail(PARSE_ERROR)
  const p = payload as { type?: unknown; text?: unknown; courseName?: unknown }
  if (p.type !== 'attendance') return fail(PARSE_ERROR)
  const text = typeof p.text === 'string' ? p.text : ''
  if (!text.trim()) return fail(READ_ERROR)
  if (text.includes(NONE_MARKER)) {
    return { accepting: false, courseName: null, confirmWindow: null, remaining: null, error: null }
  }
  const name = typeof p.courseName === 'string' && p.courseName.trim() ? p.courseName.trim() : text.trim()
  return {
    accepting: true,
    courseName: name,
    confirmWindow: extractWindow(text),
    remaining: extractRemaining(text),
    error: null,
  }
}
