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
}

// ===== テキスト整形 =====
function normalizeText(text: unknown): string {
  return String(text ?? '').trim().replace(/\s+/g, ' ')
}

function stripTags(html: string): string {
  return normalizeText(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' '),
  )
}

function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
  }
  return String(text).replace(
    /&(amp|lt|gt|quot|#39|nbsp);/g,
    (match) => entities[match] ?? match,
  )
}

/** HTMLをテキストに変換する。ブロック要素は改行、script/styleは除去、エンティティは復号。 */
export function htmlToPlainText(html: string): string {
  return decodeHtmlEntities(
    stripTags(
      String(html)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<\/tr>/gi, '\n')
        .replace(/<\/th>/gi, ' ')
        .replace(/<\/td>/gi, ' '),
    ),
  )
}

// ===== 締切パース =====
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
    if (text.includes('ステータス 終了') || text.includes('status finished')) {
      return 'completed'
    }
    if (text.includes('受験済み') || text.includes('attempt finished')) {
      return 'completed'
    }
    if (
      text.includes('利用できません') ||
      text.includes('not available') ||
      text.includes('未受験') ||
      text.includes('not attempted')
    ) {
      return 'not_submitted'
    }
    return 'unknown'
  }

  if (text.includes('提出済み') || text.includes('submitted')) {
    return 'submitted'
  }
  if (text.includes('未提出') || text.includes('not submitted')) {
    return 'not_submitted'
  }
  return 'unknown'
}

function isBeforeStart(plainText: string): boolean {
  const text = normalizeText(plainText)
  return text.includes('開始予定') && text.includes('利用できません')
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
  const deadline = parseDeadline(extractDeadlineText(plainText))
  const submissionStatus = extractSubmissionStatus(plainText, url)
  const lifecycleStatus = resolveLifecycleStatus(plainText, submissionStatus, deadline)
  return { deadline, submissionStatus, lifecycleStatus }
}
