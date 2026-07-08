import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * 自動更新のスロットル用タイムスタンプ（最終成功時刻ISO）。時間割はCLASSに触るため頻繁に
 * 走らせたくない。1日1回程度に制限する判定に使う。
 */
const TIMETABLE_KEY = 'refresh.timetable.at.v1'

// この間隔以内に更新済みならスキップする（起動のたびにCLASSを触らない）。
export const TIMETABLE_REFRESH_INTERVAL_MS = 20 * 60 * 60 * 1000 // 20時間

export async function loadTimetableRefreshedAt(): Promise<number> {
  const raw = await AsyncStorage.getItem(TIMETABLE_KEY)
  const n = raw ? Number(raw) : 0
  return Number.isFinite(n) ? n : 0
}

export async function saveTimetableRefreshedAt(at: number = Date.now()): Promise<void> {
  await AsyncStorage.setItem(TIMETABLE_KEY, String(at))
}

/** 前回更新から間隔を過ぎていれば true（=更新すべき）。 */
export function isTimetableStale(lastAt: number, now: number = Date.now()): boolean {
  return now - lastAt >= TIMETABLE_REFRESH_INTERVAL_MS
}
