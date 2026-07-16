import { parseDeadlineInput } from './manualAssignment'

/**
 * DeadlineValue の文字列（"YYYY/MM/DD"・"HH:mm"）とネイティブ日時ピッカーの Date を相互変換する
 * 純粋ヘルパー。now は呼び出し側が注入（テスト可能・Date.now非依存）。
 */

/**
 * ピッカーの初期値用 Date。日付＋時刻が有効ならその日時。
 * 時刻だけ不正なら 23:59 で補完。日付が空/不正なら now の日付（時刻は入力値か 23:59）。
 */
export function deadlineValueToDate(value: { date: string; time: string }, now: Date): Date {
  const iso = parseDeadlineInput(value.date, value.time) ?? parseDeadlineInput(value.date, '23:59')
  if (iso) return new Date(iso)
  const tm = value.time.trim().match(/^(\d{1,2}):(\d{2})$/)
  const h = tm && Number(tm[1]) <= 23 ? Number(tm[1]) : 23
  const mi = tm && Number(tm[2]) <= 59 ? Number(tm[2]) : 59
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, mi, 0, 0)
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Date → "YYYY/MM/DD"（DeadlineValue.date の形式）。 */
export function dateToDeadlineDateString(d: Date): string {
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`
}

/** Date → "HH:mm"（DeadlineValue.time の形式）。 */
export function dateToDeadlineTimeString(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
