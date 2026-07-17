/**
 * 「今日見た出席受付時間」の直列化（純粋・RN非依存）。壊れ値・未知値は null に倒す
 * （＝ホームは授業ベースの残り時間へ安全に落ちる）。
 */
import type { ReceptionWindowRecord } from '../attendance/receptionWindow'

export function serializeReceptionWindow(r: ReceptionWindowRecord): string {
  return JSON.stringify({ date: r.date, window: r.window, courseName: r.courseName })
}

export function deserializeReceptionWindow(raw: string | null): ReceptionWindowRecord | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const e = parsed as Record<string, unknown>
  // date と window が揃っていない記録は使いようがない（日付照合とアンカー判定の両方に要る）。
  if (typeof e.date !== 'string' || !e.date) return null
  if (typeof e.window !== 'string' || !e.window) return null
  return {
    date: e.date,
    window: e.window,
    courseName: typeof e.courseName === 'string' ? e.courseName : null,
  }
}
