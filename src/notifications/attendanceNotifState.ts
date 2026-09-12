/**
 * 出席通知のプロセス内の状態（純粋・RN非依存・N1 §4.4〜4.6）。アプリを再起動すると消える（どれも「起動してから」の値でよい）。
 * - 出席の直列キュー: 出席の同期（§4.2）・受付open の提示〜記録（§4.3）・出席済みの取り下げ（§4.4）を1本ずつ実行する（§4.5）。
 *   serializeRuns（合流あり）と違い、投げた仕事を全部順に実行する。
 * - 取り下げた枠の当日集合: 出席の記録の保存（fire-and-forget）より先に貼り直しが走っても除外できるように持つ（§4.4）。
 * - 予約失敗の数: 計器の fail（§4.6）。
 */
import { createWriteQueue } from '../storage/writeQueue'

export const enqueueAttendanceNotif = createWriteQueue()

let retracted: { date: string; ids: Set<string> } = { date: '', ids: new Set() }

/** 出席済みで取り下げた枠を当日の集合に入れる。日付が変わったら前の日の分は捨てる。 */
export function markRetracted(date: string, ids: readonly string[]): void {
  if (retracted.date !== date) retracted = { date, ids: new Set() }
  for (const id of ids) retracted.ids.add(id)
}

/** その日に取り下げた枠（別の日なら空）。 */
export function retractedFor(date: string): string[] {
  return retracted.date === date ? [...retracted.ids] : []
}

let failures = 0

/** 予約の失敗を数える（出席・課題の両方）。 */
export function addScheduleFailures(n: number): void {
  if (n > 0) failures += n
}

/** 起動してからの予約失敗の数。 */
export function scheduleFailures(): number {
  return failures
}

/** テスト専用。 */
export function resetAttendanceNotifStateForTest(): void {
  retracted = { date: '', ids: new Set() }
  failures = 0
}
