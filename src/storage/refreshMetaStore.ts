import { Storage } from './asyncStorage'

/**
 * 自動更新のスロットル用タイムスタンプ（最終成功時刻ISO）。時間割はCLASSに触るため頻繁に
 * 走らせたくない。1日1回程度に制限する判定に使う。
 */
const TIMETABLE_KEY = 'refresh.timetable.at.v1'
const BULLETIN_KEY = 'refresh.bulletin.at.v1'
const ASSIGNMENTS_KEY = 'refresh.assignments.at.v1'
const ATTENDANCE_STATS_KEY = 'refresh.attendanceStats.at.v1'

// この間隔以内に更新済みならスキップする（起動のたびにCLASSを触らない）。
export const TIMETABLE_REFRESH_INTERVAL_MS = 20 * 60 * 60 * 1000 // 20時間
// 掲示は時間割より更新頻度が高いので短め。インフォタブを開いたときに古ければ裏更新する。
export const BULLETIN_REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000 // 3時間
// 出欠状況は1コマ終わるごとにしか動かない。背景トリガを増やす以上、CLASS負荷を増やさないため
// 長めに取る（[[litus-load-audit-2026-07-13]]「静かに運用」）。ユーザー起点の同期はTTLを無視する。
export const ATTENDANCE_STATS_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6時間

export async function loadTimetableRefreshedAt(): Promise<number> {
  const raw = await Storage.getItem(TIMETABLE_KEY)
  const n = raw ? Number(raw) : 0
  return Number.isFinite(n) ? n : 0
}

export async function saveTimetableRefreshedAt(at: number = Date.now()): Promise<void> {
  await Storage.setItem(TIMETABLE_KEY, String(at))
}

/** 前回更新から間隔を過ぎていれば true（=更新すべき）。 */
export function isTimetableStale(lastAt: number, now: number = Date.now()): boolean {
  return now - lastAt >= TIMETABLE_REFRESH_INTERVAL_MS
}

export async function loadBulletinRefreshedAt(): Promise<number> {
  const raw = await Storage.getItem(BULLETIN_KEY)
  const n = raw ? Number(raw) : 0
  return Number.isFinite(n) ? n : 0
}

export async function saveBulletinRefreshedAt(at: number = Date.now()): Promise<void> {
  await Storage.setItem(BULLETIN_KEY, String(at))
}

/** 掲示の前回更新から間隔を過ぎていれば true。 */
export function isBulletinStale(lastAt: number, now: number = Date.now()): boolean {
  return now - lastAt >= BULLETIN_REFRESH_INTERVAL_MS
}

export async function loadAssignmentsRefreshedAt(): Promise<number> {
  const raw = await Storage.getItem(ASSIGNMENTS_KEY)
  const n = raw ? Number(raw) : 0
  return Number.isFinite(n) ? n : 0
}

export async function saveAssignmentsRefreshedAt(at: number = Date.now()): Promise<void> {
  await Storage.setItem(ASSIGNMENTS_KEY, String(at))
}

export async function loadAttendanceStatsRefreshedAt(): Promise<number> {
  const raw = await Storage.getItem(ATTENDANCE_STATS_KEY)
  const n = raw ? Number(raw) : 0
  return Number.isFinite(n) ? n : 0
}

export async function saveAttendanceStatsRefreshedAt(at: number = Date.now()): Promise<void> {
  await Storage.setItem(ATTENDANCE_STATS_KEY, String(at))
}

/** 出欠の前回更新から間隔を過ぎていれば true（背景トリガ専用。ユーザー起点はTTLを見ない）。 */
export function isAttendanceStatsStale(lastAt: number, now: number = Date.now()): boolean {
  return now - lastAt >= ATTENDANCE_STATS_REFRESH_INTERVAL_MS
}
