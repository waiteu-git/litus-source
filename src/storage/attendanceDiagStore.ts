import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * 出欠収集の実機診断文字列（1行）を保持する。実機でheadless収集のどこで落ちるかを可視化するための
 * 一時デバッグ導線。pi(headless)では再現しない実機固有の失敗（メニュー発火/着地/セッション競合）を
 * 開発者が科目詳細で読めるようにする。※公開前に撤去する。
 */
const KEY = 'attendance.diag.v1'

export async function saveAttendanceDiag(s: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, s)
  } catch {
    // 診断は best-effort。保存失敗は無視。
  }
}

export async function loadAttendanceDiag(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY)
  } catch {
    return null
  }
}
