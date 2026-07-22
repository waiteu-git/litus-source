import type { Assignment } from '../storage/assignmentsSerialize'

/** 手動追加課題のキー接頭辞。LETUS由来URL（http...）と混ざらないようにする。 */
export const MANUAL_PREFIX = 'manual://'

export function isManualUrl(url: string): boolean {
  return url.startsWith(MANUAL_PREFIX)
}

/**
 * 締切の日付("YYYY/MM/DD" or "YYYY-MM-DD")と時刻("HH:MM")をISO文字列へ。
 * 日付が空なら null（＝締切なし）。不正な値は null（呼び出し側でバリデーション表示）。
 * 時刻が空のときは 23:59 を既定にする（「その日中」の意）。
 */
export function parseDeadlineInput(dateStr: string, timeStr: string): string | null {
  const d = dateStr.trim()
  if (!d) return null
  const dm = d.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
  if (!dm) return null
  const y = Number(dm[1])
  const mo = Number(dm[2])
  const day = Number(dm[3])
  let h = 23
  let mi = 59
  const t = timeStr.trim()
  if (t) {
    const tm = t.match(/^(\d{1,2}):(\d{2})$/)
    if (!tm) return null
    h = Number(tm[1])
    mi = Number(tm[2])
  }
  if (mo < 1 || mo > 12 || day < 1 || day > 31 || h > 23 || mi > 59) return null
  const date = new Date(y, mo - 1, day, h, mi, 0, 0)
  // 2/31 のような繰り上がりを弾く（構築後に成分が一致するか）。
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== day) return null
  return date.toISOString()
}

/** 締切ISO → "YYYY/MM/DD HH:MM"（ローカル）。null は「締切なし」。 */
export function formatDeadlineText(iso: string | null): string {
  if (!iso) return '締切なし'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '締切なし'
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

/** ISO文字列を "YYYY/MM/DD" と "HH:MM" に分解（編集フォームの初期値用）。null は空文字。 */
export function splitDeadline(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: '', time: '' }
  const p2 = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())}`,
    time: `${p2(d.getHours())}:${p2(d.getMinutes())}`,
  }
}

/** 手動課題エントリを組み立てる（id/now は呼び出し側が注入＝純粋・テスト可能）。 */
export function makeManualAssignment(
  input: { title: string; courseName: string; deadline: string | null },
  id: string,
  nowIso: string,
): Assignment {
  return {
    url: id,
    courseCode: null,
    courseName: input.courseName.trim() || '手動追加',
    title: input.title.trim(),
    deadline: input.deadline,
    deadlineText: formatDeadlineText(input.deadline),
    submissionStatus: 'not_submitted',
    lifecycleStatus: 'active',
    ignored: false,
    firstSeenAt: nowIso,
    lastSeenAt: nowIso,
    lastCheckedAt: nowIso,
    manual: true,
  }
}

/**
 * 収集対象外アクティビティ（+追加のPDF resource等）を、締切・提出状態をユーザーが所有する形で
 * 組み立てる。makeManualAssignment と異なり実URLをキーに持ち（タップで開ける）、manualフラグは
 * 付けない（所有権は isUserManagedUrl がURLから導出する）。now は呼び出し側が注入＝テスト可能。
 */
export function makeUserManagedActivity(
  input: { url: string; title: string; courseName: string; deadline: string | null },
  nowIso: string,
): Assignment {
  return {
    url: input.url,
    courseCode: null,
    courseName: input.courseName.trim() || '追加',
    title: input.title.trim(),
    deadline: input.deadline,
    deadlineText: formatDeadlineText(input.deadline),
    submissionStatus: 'not_submitted',
    lifecycleStatus: 'active',
    ignored: false,
    firstSeenAt: nowIso,
    lastSeenAt: nowIso,
    lastCheckedAt: nowIso,
  }
}

/**
 * 課題URLから開くべき画面を決める。
 *
 * 手動追加の課題は LETUS 上に実体が無いので LetusAssignmentDetail では開けない。
 * この判定が HomeScreen と通知タップ経路で二重に書かれていて、通知側だけ抜けていた
 * （手動課題のリマインドをタップすると LETUS 用の画面へ飛んでいた）。共有して二度と割れないようにする。
 */
export function assignmentScreenFor(url: string): 'ManualAssignment' | 'LetusAssignmentDetail' {
  return isManualUrl(url) ? 'ManualAssignment' : 'LetusAssignmentDetail'
}
