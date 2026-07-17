/**
 * 出席ページの受付状態を注入JSのpostMessageから判定する純粋関数。
 * 注入JS（DETECT_ATTENDANCE_JS）は本文テキストと**目印フラグ**（attendSuc/hasCodeInput/signEnded/timeSum）
 * を渡すだけで、状態判定はここに集約する。判定はモバイル出席登録ページ（Xua001）の実DOM由来:
 * - `.attendSuc`（「出席」）＝出席が記録された確定マーカー（どのデバイスで出しても付く＝cross-device）
 * - 認証コード入力欄／「出席登録する」ボタン＝未提出（受付中）
 * - `.signFlging`（「出席確認終了」）/ `.timeSum<=0` ＝受付終了
 * - `.reactionMsg`（リアペ必須授業）＝コード送信後の「出席登録は完了していません。」等。
 *   ③提出済みにも同クラスで「リアクションペーパー提出済み」が付くため**文言で**未完了を判定する
 */

export type AttendanceStatus = 'none' | 'accepting' | 'attended' | 'closed' | 'reaction_pending' | 'unknown'

/**
 * 出席ページ自身が表示するアクセス元ネットワーク種別。実DOM（協力者採取fixture）の
 * 「学内ネットワークからのアクセス」ラベル由来。id は j_idt 自動採番で不安定なため文言でのみ判定する。
 * 学外側の文言は handover.md の観測メモ由来（実DOM未採取）＝一致しない場合は unknown に落ちるだけで
 * 誤警告は出ない（安全側）。IPアドレスは抽出・保存しない（判定は文言のみ・3層基準）。
 */
export type AttendanceNetwork = 'on' | 'off' | 'unknown'

export type AttendanceReception = {
  status: AttendanceStatus
  /** status==='accepting' の派生（既存consumer homeBanner等の互換用）。 */
  accepting: boolean
  courseName: string | null
  confirmWindow: string | null
  remaining: string | null
  error: string | null
  /** 学内/学外ネットワーク判定（ページ文言由来。'off' のときだけ画面が警告を出す）。 */
  network: AttendanceNetwork
  /**
   * この授業でリアクションペーパーを**書けるか**（必須かどうかとは独立）。
   * 判定＝リアペ提出ボタンが出ている かつ 未提出。文言(.reactionMsg)は状態で変わる
   * （必須未提出／未提出／提出済み）が、**ボタンの有無が提出可否そのもの**なのでそれを信号にする。
   * 必須(reaction_pending)でない授業でも任意提出の導線を出すために使う。
   */
  reactionAvailable: boolean
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
  /** label.reactionMsg 全件の連結テキスト（リアペ必須授業のみ出現）。 */
  reactionMsg?: unknown
  /** リアペ提出ボタンが出ているか（＝この授業でリアペを出せるか。必須かどうかとは独立）。 */
  hasReactionBtn?: unknown
}

function base(status: AttendanceStatus): AttendanceReception {
  return {
    status,
    accepting: status === 'accepting',
    courseName: null,
    confirmWindow: null,
    remaining: null,
    error: null,
    network: 'unknown',
    reactionAvailable: false,
  }
}

/** 提出済みを示す文言か（「リアクションペーパー提出済み」）。未提出系と誤マッチしないこと。 */
function isReactionSubmitted(reactionMsg: string): boolean {
  return /提出済/.test(reactionMsg)
}

/**
 * リアペを書けるか。ボタンが出ていて、かつ提出済みでないこと。
 * 必須(reaction_pending)かどうかとは独立＝必須でない授業でも任意提出の導線を出すために使う。
 */
function reactionAvailableOf(p: Payload, reactionMsg: string): boolean {
  return p.hasReactionBtn === true && !isReactionSubmitted(reactionMsg)
}

function fail(error: string): AttendanceReception {
  return { ...base('unknown'), error }
}

/** 本文テキストから学内/学外を判定する。どちらの文言も無ければ unknown（警告は出さない）。 */
export function detectAttendanceNetwork(text: string): AttendanceNetwork {
  if (text.includes('学外ネットワークからのアクセス')) return 'off'
  if (text.includes('学内ネットワークからのアクセス')) return 'on'
  return 'unknown'
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
  // 学内/学外はどの状態でも本文から拾える（表示されないページでは unknown）。
  const network = detectAttendanceNetwork(text)
  const reactionMsg = typeof p.reactionMsg === 'string' ? p.reactionMsg : ''
  // リアペを書けるか（＝ボタンが出ていて未提出）。必須かどうかとは独立なので、どの状態でも付ける。
  const reactionAvailable = reactionAvailableOf(p, reactionMsg)

  // 1) 出席済み: attendSuc は本文が薄くても確定。空本文チェックより先に見る。
  if (p.attendSuc === true) {
    const r = base('attended')
    r.courseName = courseNameOf(p)
    r.confirmWindow = windowOf()
    r.network = network
    r.reactionAvailable = reactionAvailable
    return r
  }

  if (!text.trim()) return fail(READ_ERROR)

  // 2) 受付なし
  if (text.includes(NONE_MARKER)) return { ...base('none'), network, reactionAvailable }

  const cw = windowOf()

  // 3) リアペ待ち: 出席コードは受理されたがリアクションペーパー未提出（attendSuc無しは1)で担保）。
  //    ①ではコード入力欄・出席登録するボタンが消えるため、この検知が無いと unknown に落ちて
  //    ユーザーに理由が見えない。受付終了(closed)より優先して「リアペを出せば出席になる」を見せる。
  //    ③提出済みの「リアクションペーパー提出済み」に誤マッチしないよう未完了文言のみで判定する。
  //    ここは**必須**（出さないと出席にならない）＝任意提出(reactionAvailable)より強い状態。
  if (/完了していません|提出してください/.test(reactionMsg)) {
    const r = base('reaction_pending')
    r.courseName = courseNameOf(p)
    r.confirmWindow = cw
    r.remaining = extractRemaining(text) ?? remainingFromSec(p.timeSum)
    r.network = network
    r.reactionAvailable = reactionAvailable
    return r
  }

  // 4) 受付中（未提出）: コード入力欄／出席登録するボタンあり
  if (p.hasCodeInput === true) {
    const r = base('accepting')
    r.courseName = courseNameOf(p)
    r.confirmWindow = cw
    r.remaining = extractRemaining(text) ?? remainingFromSec(p.timeSum)
    r.network = network
    r.reactionAvailable = reactionAvailable
    return r
  }

  // 5) 受付終了・未提出: 科目表示あり・入力なし・受付終了（signEnded or timeSum<=0）
  const ended = p.signEnded === true || (typeof p.timeSum === 'number' && p.timeSum <= 0)
  if (cw && ended) {
    const r = base('closed')
    r.courseName = courseNameOf(p)
    r.confirmWindow = cw
    r.network = network
    r.reactionAvailable = reactionAvailable
    return r
  }

  // 6) 遷移中/その他
  return { ...base('unknown'), network, reactionAvailable }
}
