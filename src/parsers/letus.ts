/**
 * LETUS（Moodle）課題/小テストページの純粋パーサー。
 * ネットワーク・document/window に依存しない。WebViewのJS注入でDOMから取り出したHTML文字列を
 * 入力に取り、締切ISO・提出状態・ライフサイクル状態を返す。
 *
 * 出典: ルート拡張機能 src/background/index.ts の純粋関数群を app/ 独立パッケージへ移植したもの
 * （挙動は等価。突合・リンク候補検出は本モジュール対象外＝収集レイヤー/後続plan）。
 */

export type AssignmentSubmissionStatus =
  | 'unknown'
  | 'not_submitted'
  | 'submitted'
  | 'completed'

export type AssignmentLifecycleStatus =
  | 'active'
  | 'new'
  | 'changed'
  | 'before_start'
  | 'submitted'
  | 'passed'
  | 'missing'
  | 'archived'

export type ParsedAssignmentPage = {
  deadline: string | null
  submissionStatus: AssignmentSubmissionStatus
  lifecycleStatus: AssignmentLifecycleStatus
  /**
   * 自己診断（diagnose.ts §4.3 diagnoseActivityPage）用の抽出フラグ。パース本体のロジックは
   * 変えず、「見つかった/パースできた」の可否だけを併せて返す（spec§4.4 の「唯一の侵襲＝戻り値を
   * 値だけから値＋抽出フラグへ広げる」に対応）。
   */
  /** 締切キーワード（extractDeadlineText 相当）が本文から見つかったか。 */
  keywordFound: boolean
  /** parseDeadline が日付を返したか（キーワードは在るが日付が取れない＝書式変更の兆候の判別用）。 */
  dateParsed: boolean
  /** 提出状態が unknown 以外に解決したか。 */
  statusResolved: boolean
}

import { normalizeText, htmlToPlainText } from './text'

export { htmlToPlainText }

// ===== 締切パース =====
/** 英語ロケール Moodle 日付書式（`%B`）の月名。index+1 が月番号。 */
const ENGLISH_MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

function toIsoStringFromParts(
  year: string,
  month: string,
  day: string,
  hour: string,
  minute: string,
): string | null {
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0,
  )
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

/** 締切キーワードの最初の出現位置から本文を切り出す。開始情報のみ/締切なしは空文字。 */
export function extractDeadlineText(plainText: string): string {
  const text = normalizeText(plainText)
  const deadlineKeywords = [
    '提出期限', '提出締切', '締切日時', '締切', '期限', '終了予定', '終了済み', '終了日時',
    '利用終了日時', '受験終了', '回答終了',
    'Due date', 'Closing date', 'Close date', 'Closes', 'Due', 'Close',
  ]
  const startKeywords = [
    '開始予定', '開始日時', '開始済み', '開始', '利用開始日時', '受験開始', '公開日時', '公開',
    'Open date', 'Opened', 'Available from',
  ]
  const lowerText = text.toLowerCase()
  let bestIndex = -1

  for (const keyword of deadlineKeywords) {
    const index = lowerText.indexOf(keyword.toLowerCase())
    if (index >= 0 && (bestIndex === -1 || index < bestIndex)) {
      bestIndex = index
    }
  }

  if (bestIndex >= 0) {
    return text.slice(bestIndex, Math.min(text.length, bestIndex + 320))
  }

  const hasStartOnlyKeyword = startKeywords.some((keyword) =>
    lowerText.includes(keyword.toLowerCase()),
  )
  if (hasStartOnlyKeyword) return ''
  return ''
}

/** 締切テキストから日時をISO文字列に変換する。年/時刻の欠落は当年/23:59に補完。 */
export function parseDeadline(deadlineText: string): string | null {
  const text = normalizeText(deadlineText)

  const japaneseDateMatch = text.match(
    /(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*[(（][^)）]*[)）])?\s*(?:(\d{1,2})\s*(?:時|:|：)\s*(\d{1,2})?\s*分?)?/,
  )
  if (japaneseDateMatch) {
    const hasHour = japaneseDateMatch[4] !== undefined
    return toIsoStringFromParts(
      japaneseDateMatch[1],
      japaneseDateMatch[2],
      japaneseDateMatch[3],
      hasHour ? japaneseDateMatch[4] : '23',
      hasHour ? (japaneseDateMatch[5] ?? '00') : '59',
    )
  }

  const noYearJapaneseDateMatch = text.match(
    /(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*[(（][^)）]*[)）])?\s*(?:(\d{1,2})\s*(?:時|:|：)\s*(\d{1,2})?\s*分?)?/,
  )
  if (noYearJapaneseDateMatch) {
    const currentYear = String(new Date().getFullYear())
    const hasHour = noYearJapaneseDateMatch[3] !== undefined
    return toIsoStringFromParts(
      currentYear,
      noYearJapaneseDateMatch[1],
      noYearJapaneseDateMatch[2],
      hasHour ? noYearJapaneseDateMatch[3] : '23',
      hasHour ? (noYearJapaneseDateMatch[4] ?? '00') : '59',
    )
  }

  // 英語ロケールの Moodle 日付書式（`%A, %d %B %Y, %I:%M %p`）:
  //   "Tuesday, 12 December 2023, 12:00 AM" のように 日 月名 西暦 + 12時間制AM/PM。
  //   TUS は日本語運用だが、5.x で言語パックが英語のコース/ページを踏んでも締切を落とさない保険。
  //   曜日は任意、時刻(12時間 AM/PM または 24時間)も任意。年欠落は英語 assign では想定しない。
  const englishDateMatch = text.match(
    /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})(?:,?\s*(\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?/i,
  )
  if (englishDateMatch) {
    const monthIndex = ENGLISH_MONTHS.indexOf(englishDateMatch[2].toLowerCase())
    if (monthIndex >= 0) {
      const hasTime = englishDateMatch[4] !== undefined
      let hour = hasTime ? Number(englishDateMatch[4]) : 23
      const minute = hasTime ? englishDateMatch[5] : '59'
      // AM/PM があれば 12時間→24時間へ補正（12:00 AM=00:00 / 12:00 PM=12:00）。無ければ 24時間として扱う。
      const meridiem = (englishDateMatch[6] || '').toUpperCase()
      if (meridiem === 'PM' && hour < 12) hour += 12
      if (meridiem === 'AM' && hour === 12) hour = 0
      return toIsoStringFromParts(
        englishDateMatch[3],
        String(monthIndex + 1),
        englishDateMatch[1],
        String(hour),
        minute,
      )
    }
  }

  return null
}

// ===== 提出状態・ライフサイクル =====
export function extractSubmissionStatus(
  plainText: string,
  url: string,
): AssignmentSubmissionStatus {
  const text = normalizeText(plainText).toLowerCase()
  const isQuiz = url.toLowerCase().includes('/mod/quiz/')

  if (isQuiz) {
    // 受験済み（実DOM 2026-07-10 mod/quiz 受験サマリ）: ステータス=終了 / 完了日時あり / 受験済み。
    // ステータスとの間の空白ゆれに強い正規表現で判定する。
    if (
      /ステータス\s*終了/.test(text) ||
      text.includes('完了日時') ||
      text.includes('受験済み') ||
      text.includes('status finished') ||
      text.includes('attempt finished')
    ) {
      return 'completed'
    }
    // 未受験（実DOM: 受験サマリが無く「(小テストを)受験する」開始ボタンがある）。
    if (
      text.includes('受験する') ||
      text.includes('attempt quiz') ||
      text.includes('未受験') ||
      text.includes('not attempted') ||
      text.includes('利用できません') ||
      text.includes('not available')
    ) {
      return 'not_submitted'
    }
    return 'unknown'
  }

  // 実DOM 2026-07-10（mod/assign 提出ステータス行）:
  //  提出済み = 「評定のために提出済み」（"提出済み" を含む） / Submitted for grading
  //  未提出   = 「まだ提出されていません」（"未提出" は含まれない＝旧実装が unknown を返す真因）
  if (
    text.includes('提出済み') ||
    text.includes('submitted for grading') ||
    text.includes('submitted')
  ) {
    return 'submitted'
  }
  if (
    text.includes('未提出') ||
    text.includes('まだ提出されていません') ||
    text.includes('提出されていません') ||
    text.includes('提出がありません') ||
    text.includes('not submitted') ||
    text.includes('no attempt') ||
    text.includes('nothing has been submitted') ||
    // 英語課題ページの未提出値（5.2 EN 実採取）: "No submissions have been made yet"。
    text.includes('no submissions have been made') ||
    text.includes('no submission has been made')
  ) {
    return 'not_submitted'
  }
  return 'unknown'
}

function isBeforeStart(plainText: string): boolean {
  const text = normalizeText(plainText)
  if (text.includes('開始予定') && text.includes('利用できません')) return true
  // 小テストが「まだ受験できない」状態（受験サマリ・開始ボタンが無く「(現在、)この小テストは
  // 利用できません」と表示。実DOM 2026-07-10）。未公開ではなく“受験不可”を before_start として扱う。
  if (text.includes('小テストは利用できません')) return true
  return false
}

function isDeadlinePassed(deadline: string | null): boolean {
  if (!deadline) return false
  const date = new Date(deadline)
  if (Number.isNaN(date.getTime())) return false
  return date.getTime() < Date.now()
}

export function resolveLifecycleStatus(
  plainText: string,
  submissionStatus: AssignmentSubmissionStatus,
  deadline: string | null,
): AssignmentLifecycleStatus {
  if (isBeforeStart(plainText)) return 'before_start'
  if (submissionStatus === 'submitted' || submissionStatus === 'completed') return 'submitted'
  if (isDeadlinePassed(deadline)) return 'passed'
  return 'active'
}

// ===== 合成 =====
/** 課題/小テストページのHTMLと自身のURLから、締切・提出状態・ライフサイクルをまとめて返す。 */
export function parseAssignmentPage(html: string, url: string): ParsedAssignmentPage {
  const plainText = htmlToPlainText(html)
  const deadlineText = extractDeadlineText(plainText)
  const deadline = parseDeadline(deadlineText)
  const submissionStatus = extractSubmissionStatus(plainText, url)
  const lifecycleStatus = resolveLifecycleStatus(plainText, submissionStatus, deadline)
  return {
    deadline,
    submissionStatus,
    lifecycleStatus,
    // extractDeadlineText は締切キーワードが無い（開始のみ含む）と '' を返す＝keywordFound=false。
    keywordFound: deadlineText !== '',
    dateParsed: deadline !== null,
    statusResolved: submissionStatus !== 'unknown',
  }
}

/**
 * 課題/小テストページに着地済みか（提出状況か締切のどちらかが読めれば着地とみなす）。
 * 本文パーサ(letusBody)がコンテナ構造依存で空を返しても、本関数は本文全体のプレーンテキスト
 * 照合なので着地を検知でき、本文フェッチャの「空→無限待ち→タイムアウト失敗」を断てる。
 * SSO中間ページ/ポータルでは submissionStatus='unknown' かつ deadline=null になり false。
 */
export function isAssignPageLanded(html: string, url: string): boolean {
  const { submissionStatus, deadline } = parseAssignmentPage(html, url)
  return submissionStatus !== 'unknown' || deadline != null
}
