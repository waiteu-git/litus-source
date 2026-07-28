import { Storage } from './asyncStorage'
import { withExpiredCodeCleared, type AttendedRecord } from '../attendance/attendedState'

export const ATTENDANCE_DONE_KEY = 'attendance.done.v1'
const KEY = ATTENDANCE_DONE_KEY

export async function saveAttendedRecord(r: AttendedRecord): Promise<void> {
  await Storage.setItem(KEY, JSON.stringify(r))
}

export async function loadAttendedRecord(): Promise<AttendedRecord | null> {
  const raw = await Storage.getItem(KEY)
  if (!raw) return null
  try {
    const p = JSON.parse(raw) as Partial<AttendedRecord>
    if (typeof p?.date === 'string' && typeof p?.code === 'string' && typeof p?.courseName === 'string') {
      return {
        date: p.date,
        courseName: p.courseName,
        confirmWindow: typeof p.confirmWindow === 'string' ? p.confirmWindow : null,
        code: p.code,
      }
    }
  } catch {
    // 壊れていれば無視
  }
  return null
}

/**
 * 表示期間の終わった出席コードを保存値から落とす（監査M-1）。掃除後の記録を返す。
 *
 * 判定は表示と同じ `withExpiredCodeCleared`（＝`isAttendedNow`）。**変化したときだけ**書き戻す
 * ので、記録を読むたびに AsyncStorage へ書き込むことはない。既存データ（code が入ったまま
 * 期限切れの記録）もこの経路を通れば同じ規則で消える＝移行用の別処理は要らない。
 *
 * バックグラウンド処理は足さない方針（アプリに BG 実行は無い）ため、消える契機は
 * 「アプリが記録を読むタイミング」＝実質次回起動まで残ることは許容する。
 */
export async function scrubExpiredAttendedCode(
  rec: AttendedRecord | null,
  now: Date,
  classEndMin: number | null,
): Promise<AttendedRecord | null> {
  const cleaned = withExpiredCodeCleared(rec, now, classEndMin)
  if (cleaned !== rec && cleaned) await saveAttendedRecord(cleaned)
  return cleaned
}
