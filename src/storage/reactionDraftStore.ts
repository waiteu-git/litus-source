import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ReactionDraft } from '../attendance/reactionPaper'

/**
 * リアペ本文の下書き（単一スロット）。提出確定（出席済み検知）まで本文を失わないための保全先で、
 * 復元可否の判定は純粋関数 reactionDraftApplies（同日＋科目照合）が行う。
 * ライタはAttendanceScreen（保存）とAttendanceEngineProvider（提出確定時のクリア）のみ。
 */
const KEY = 'attendance.reactionDraft.v1'

export async function saveReactionDraft(d: ReactionDraft): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(d))
}

export async function loadReactionDraft(): Promise<ReactionDraft | null> {
  const raw = await AsyncStorage.getItem(KEY)
  if (!raw) return null
  try {
    const p = JSON.parse(raw) as Partial<ReactionDraft>
    if (typeof p?.date === 'string' && typeof p?.text === 'string') {
      return {
        date: p.date,
        courseName: typeof p.courseName === 'string' ? p.courseName : null,
        text: p.text,
      }
    }
  } catch {
    // 壊れていれば無視
  }
  return null
}

export async function clearReactionDraft(): Promise<void> {
  await AsyncStorage.removeItem(KEY)
}
