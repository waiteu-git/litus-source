/**
 * 出席ページの受付状態を注入JSのpostMessageから判定する純粋関数。
 * 注入JS（DETECT_ATTENDANCE_JS）は本文テキストと**目印フラグ**（attendSuc/hasCodeInput/signEnded/timeSum）
 * を渡すだけで、状態判定はここに集約する。判定はモバイル出席登録ページ（Xua001）の実DOM由来:
 * - `.attendSuc`（「出席」）＝出席が記録された確定マーカー（どのデバイスで出しても付く＝cross-device）
 * - 認証コード入力欄／「出席登録する」ボタン＝未提出（受付中）
 * - `.signFlging`（「出席確認終了」）/ `.timeSum<=0` ＝受付終了
 */

export type AttendanceStatus = 'none' | 'accepting' | 'attended' | 'closed' | 'unknown'

export type AttendanceReception = {
  status: AttendanceStatus
  /** status==='accepting' の派生（既存consumer homeBanner等の互換用）。 */
  accepting: boolean
  courseName: string | null
  confirmWindow: string | null
  remaining: string | null
  error: string | null
}

const NONE_MARKER = '出席確認中の履修授業はありません'
const PARSE_ERROR = 'メッセージを解析できませんでした'
const READ_ERROR = '出席受付状況を読み取れませんでした'

type Payload = {
  type?: unknown
  text?: unknown
  courseName?: unknown
  /** label.signSize の生テキスト（「出席確認時間：10:20～12:00」）。受付時間の確実な取得元。 */
  signSize?: unknown
  attendSuc?: unknown
  hasCodeInput?: unknown
  signEnded?: unknown
  timeSum?: unknown
}

function base(status: AttendanceStatus): AttendanceReception {
  return { status, accepting: status === 'accepting', courseName: null, confirmWindow: null, remaining: null, error: null }
}

function fail(error: string): AttendanceReception {
  return { ...base('unknown'), error }
}

function extractWindow(text: string): string | null {
  const m = text.match(/出席確認時間[:：]?\s*(\d{1,2}:\d{2})\s*[〜~～]\s*(\d{1,2}:\d{2})/)
  return m ? `${m[1]}〜${m[2]}` : null
}

function extractRemaining(text: string): string | null {
  const m = text.match(/あと\s*([0-9]+分[0-9]+秒|[0-9]+分|[0-9]+秒)/)
  return m ? `あと${m[1]}` : null
}

/** timeSum（残り秒）から残り時間文字列。0以下/非数は null。 */
function remainingFromSec(v: unknown): string | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null
  let s = Math.floor(v)
  const h = Math.floor(s / 3600)
  s -= h * 3600
  const m = Math.floor(s / 60)
  const sec = s % 60
  return h > 0 ? `あと${h}時間${m}分` : `あと${m}分${sec}秒`
}

function courseNameOf(p: Payload): string | null {
  return typeof p.courseName === 'string' && p.courseName.trim() ? p.courseName.trim() : null
}

export function parseAttendanceMessage(raw: string): AttendanceReception {
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return fail(PARSE_ERROR)
  }
  if (typeof payload !== 'object' || payload === null) return fail(PARSE_ERROR)
  const p = payload as Payload
  if (p.type !== 'attendance') return fail(PARSE_ERROR)
  const text = typeof p.text === 'string' ? p.text : ''
  const signSize = typeof p.signSize === 'string' ? p.signSize : ''
  // 受付時間は label.signSize（確実）を優先し、無ければ本文テキストから拾う。
  const windowOf = () => extractWindow(signSize) ?? extractWindow(text)

  // 1) 出席済み: attendSuc は本文が薄くても確定。空本文チェックより先に見る。
  if (p.attendSuc === true) {
    const r = base('attended')
    r.courseName = courseNameOf(p)
    r.confirmWindow = windowOf()
    return r
  }

  if (!text.trim()) return fail(READ_ERROR)

  // 2) 受付なし
  if (text.includes(NONE_MARKER)) return base('none')

  const cw = windowOf()

  // 3) 受付中（未提出）: コード入力欄／出席登録するボタンあり
  if (p.hasCodeInput === true) {
    const r = base('accepting')
    r.courseName = courseNameOf(p)
    r.confirmWindow = cw
    r.remaining = extractRemaining(text) ?? remainingFromSec(p.timeSum)
    return r
  }

  // 4) 受付終了・未提出: 科目表示あり・入力なし・受付終了（signEnded or timeSum<=0）
  const ended = p.signEnded === true || (typeof p.timeSum === 'number' && p.timeSum <= 0)
  if (cw && ended) {
    const r = base('closed')
    r.courseName = courseNameOf(p)
    r.confirmWindow = cw
    return r
  }

  // 5) 遷移中/その他
  return base('unknown')
}
