/**
 * 出席ページ（Xut11301.xhtml）の受付状態を注入JSのpostMessageから判定する純粋関数。
 * 注入JSは受付表示領域のテキスト（と可能なら科目名）を渡すだけで、判定はここに集約する。
 */
export type AttendanceReception = {
  accepting: boolean
  courseName: string | null
  error: string | null
}

const NONE_MARKER = '出席確認中の履修授業はありません'
const PARSE_ERROR = 'メッセージを解析できませんでした'
const READ_ERROR = '出席受付状況を読み取れませんでした'

export function parseAttendanceMessage(raw: string): AttendanceReception {
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return { accepting: false, courseName: null, error: PARSE_ERROR }
  }
  if (typeof payload !== 'object' || payload === null) {
    return { accepting: false, courseName: null, error: PARSE_ERROR }
  }
  const p = payload as { type?: unknown; text?: unknown; courseName?: unknown }
  if (p.type !== 'attendance') {
    return { accepting: false, courseName: null, error: PARSE_ERROR }
  }
  const text = typeof p.text === 'string' ? p.text : ''
  if (!text.trim()) {
    return { accepting: false, courseName: null, error: READ_ERROR }
  }
  if (text.includes(NONE_MARKER)) {
    return { accepting: false, courseName: null, error: null }
  }
  const name = typeof p.courseName === 'string' && p.courseName.trim() ? p.courseName.trim() : text.trim()
  return { accepting: true, courseName: name, error: null }
}
