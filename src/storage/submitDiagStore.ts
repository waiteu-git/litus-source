import { Storage } from './asyncStorage'
import { SUBMIT_DIAG_MAX, appendSubmitDiag, type SubmitDiag } from '../attendance/submitDiag'

/**
 * 出席送信の診断記録（直近 SUBMIT_DIAG_MAX 件・新しい順）。
 * 「次に失敗した瞬間をユーザーが捕まえる」前提は脆いので、成功も失敗も自動で貯めて
 * 後から設定画面で見返せるようにする（真因未特定の間欠バグの証拠確保）。
 * 認証コードそのものは保存しない（[[submitDiag]] の型が持たない）。
 */
const KEY = 'attendance.submitDiag.v1'

export async function loadSubmitDiags(): Promise<SubmitDiag[]> {
  const raw = await Storage.getItem(KEY)
  if (!raw) return []
  try {
    const p = JSON.parse(raw)
    if (!Array.isArray(p)) return []
    return p.filter((d) => d && typeof d.at === 'string' && typeof d.result === 'string').slice(0, SUBMIT_DIAG_MAX)
  } catch {
    return []
  }
}

/** 1件追加する（上限で古いものを捨てる）。失敗しても呼び出し側の動作は止めない。 */
export async function addSubmitDiag(entry: SubmitDiag): Promise<void> {
  const list = await loadSubmitDiags()
  await Storage.setItem(KEY, JSON.stringify(appendSubmitDiag(list, entry)))
}

export async function clearSubmitDiags(): Promise<void> {
  await Storage.removeItem(KEY)
}
