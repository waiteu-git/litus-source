/**
 * 出席受付openローカル通知の純粋ロジック（RN非依存・テスト可能）。
 * dedupキー生成・発火可否判定・文面・当日外キー剪定を担う。
 * 端末I/O（即時提示/dismiss）は notifier.ts、永続化は
 * notifiedAttendanceOpenStore.ts が行う。配線は AttendanceEngineProvider.tsx。
 * 設計: docs/superpowers/specs/2026-07-12-attendance-open-local-notification-design.md
 *
 * 即時発火型（trigger に channelId のみ）。refreshAllNotifications（スケジュール型・
 * serializeRuns 直列化）とは完全に独立した経路——混ぜない。
 */
import type { AttendanceStatus } from '../collect/attendanceMessage'
import { todayKey } from '../attendance/attendedState'

/**
 * 当日キー＋科目名＋受付時間から dedup キーを作る。
 * 受付が同日2回開かれ confirmWindow が異なれば別キー＝再通知される（再受付ケースに対応）。
 */
export function attendanceOpenKey(input: {
  courseName: string | null
  confirmWindow: string | null
  now: Date
}): string {
  return `${todayKey(input.now)}|${input.courseName ?? '?'}|${input.confirmWindow ?? '?'}`
}

/**
 * 発火可否の純粋判定。真の条件:
 *   - status === 'accepting'
 *   - attendedNow === false（既に出席済みは通知しない）
 *   - attendanceFocused === false（出席画面を見ている最中はバナーで足りるため抑制）
 *   - notifiedKeys に当該キーを含まない（同一授業/受付ウィンドウで1回に制限）
 */
export function shouldNotifyAttendanceOpen(input: {
  status: AttendanceStatus
  attendedNow: boolean
  attendanceFocused: boolean
  key: string
  notifiedKeys: string[]
}): boolean {
  if (input.status !== 'accepting') return false
  if (input.attendedNow) return false
  if (input.attendanceFocused) return false
  if (input.notifiedKeys.includes(input.key)) return false
  return true
}

/**
 * 通知文面。タイトルは定型、本文は科目名＋受付時刻範囲（null フォールバックあり）。
 */
export function buildAttendanceOpenContent(reception: {
  courseName: string | null
  confirmWindow: string | null
}): { title: string; body: string } {
  const title = '出席受付が始まりました'
  const win = reception.confirmWindow ? `（${reception.confirmWindow}）` : ''
  const body = reception.courseName
    ? `「${reception.courseName}」の出席受付中${win}。タップして出席登録`
    : `出席受付が開いています${win}。タップして出席登録`
  return { title, body }
}

/** 当日（today）以外のキーを削除する（保存時に呼び、日跨ぎの残留を防ぐ）。 */
export function pruneNotifiedAttendanceKeys(keys: string[], today: string): string[] {
  const prefix = `${today}|`
  return keys.filter((k) => k.startsWith(prefix))
}
