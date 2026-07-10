/**
 * 「この授業はもう出席登録した」状態の純粋判定（端末非依存・now注入でテスト可能）。
 * 出席完了時に記録し、その授業の受付可能時間が終わるまで「出席済み」を表示し、入力を閉じるのに使う。
 */
export type AttendedRecord = {
  /** 記録した日（YYYY-MM-DD・ローカル）。日付が変われば無効。 */
  date: string
  courseName: string
  /** 受付可能時間（"12:50〜14:30" 等）。この終了までを「その授業の間」とみなす。 */
  confirmWindow: string | null
  /** 入力して送信した出席コード。授業の間は表示しておく。 */
  code: string
}

const p2 = (n: number) => String(n).padStart(2, '0')

export function todayKey(now: Date): string {
  return `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`
}

/**
 * 記録が「今この授業の間」で有効か。今日の記録で、次の遅い方の時刻まで true:
 *   - 受付可能時間（confirmWindow）の終了
 *   - `classEndMin`（出席した授業の時限終了・分）… 受付が早く閉じても授業終了まで出席済みを維持
 * confirmWindow も classEndMin も無ければ当日中は true（時刻情報が無いケースの安全側）。
 * classEndMin は時間割由来（呼び出し側で attendedClassEndMin を用いて算出）。
 */
/**
 * 出席済み記録を更新する際、入力コードを失わないようにマージする。
 * CLASSの .attendSuc を検出して記録し直すとき、そのセッションで送信していない（同一授業への再アクセス/
 * 別デバイスで出席）と incoming.code は空になる。**同一授業**（同日かつ科目名または受付時間が一致）の
 * 既存コードだけ引き継ぐ。別の授業（例: 前のコマにアプリで出席→今のコマはPC出席）へは引き継がない
 * ＝前授業のコードを誤表示しない。
 */
export function mergeAttendedRecord(
  prev: AttendedRecord | null,
  next: AttendedRecord,
): AttendedRecord {
  if (next.code) return next
  if (!prev || prev.date !== next.date || !prev.code) return next
  const sameCourse = !!prev.courseName && prev.courseName === next.courseName
  const sameWindow = !!prev.confirmWindow && prev.confirmWindow === next.confirmWindow
  if (sameCourse || sameWindow) return { ...next, code: prev.code }
  return next
}

export function isAttendedNow(
  rec: AttendedRecord | null,
  now: Date,
  classEndMin: number | null = null,
): boolean {
  if (!rec) return false
  if (rec.date !== todayKey(now)) return false
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const m = rec.confirmWindow?.match(/(\d{1,2}):(\d{2})\D+(\d{1,2}):(\d{2})/)
  const cwEndMin = m ? Number(m[3]) * 60 + Number(m[4]) : null
  const ends: number[] = []
  if (cwEndMin != null) ends.push(cwEndMin)
  if (classEndMin != null) ends.push(classEndMin)
  if (ends.length === 0) return true
  return nowMin <= Math.max(...ends)
}
