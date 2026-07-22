/**
 * 各回の予定（ClassEvent）の日付文字列 'YYYY-MM-DD' とネイティブ日付ピッカーの Date を
 * 相互変換する純粋ヘルパー。now は呼び出し側が注入（テスト可能・Date.now非依存）。
 *
 * 課題側の deadlinePickerValue は 'YYYY/MM/DD' 形式かつ時刻とセットなので流用できない。
 */

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * 'YYYY-MM-DD' として実在する日付か。
 * new Date(s) の判定だけでは '2026-02-31' が 3/3 にロールオーバーして通ってしまうため、
 * 成分から Date を組み直して往復一致するかで確かめる。
 */
export function isValidYmd(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const dt = new Date(y, mo - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
}

/**
 * ピッカーの初期値用 Date。有効ならその日のローカル0時、空/不正なら now の年月日。
 * new Date('2026-07-15') は UTC 解釈で JST だと前日になるので、必ず成分から構築する。
 */
export function ymdToDate(s: string, now: Date): Date {
  if (isValidYmd(s)) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)!
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  }
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/** Date → ローカルの 'YYYY-MM-DD'。 */
export function dateToYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
