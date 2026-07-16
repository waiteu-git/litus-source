/**
 * 収集した課題を既存保存分へマージする純粋関数。
 * 設計: docs/2026-07-06-assignments-tab-design.md 3.3。
 * 再収集時は firstSeenAt とユーザーの ignored 選択を保持し、状態と lastSeen/lastChecked を更新。
 * 今回訪問しなかった既存分は温存する（1回の収集で全コースを回るとは限らないため）。
 * ユーザー所有URLの既存項目は締切・提出状態・タイトル等を上書きしない（訪問時刻のみ更新）。
 */
import type { Assignment, AssignmentMap } from '../storage/assignmentsSerialize'
import { isUserManagedUrl } from '../assignments/assignmentOwnership'

/** 課題ページ訪問で新たに得られるフィールド（時刻/ignoredはupsertが管理）。 */
export type CollectedAssignment = Pick<
  Assignment,
  'url' | 'courseCode' | 'courseName' | 'title' | 'deadline' | 'deadlineText' | 'submissionStatus' | 'lifecycleStatus'
>

export function upsertAssignments(
  existing: AssignmentMap,
  incoming: CollectedAssignment[],
  now: Date,
): AssignmentMap {
  const nowIso = now.toISOString()
  const out: AssignmentMap = { ...existing }
  for (const c of incoming) {
    const prev = existing[c.url]
    // ユーザー所有の既存項目は締切・提出状態・タイトル等をユーザーが手動所有するため、
    // 収集値で上書きしない（訪問時刻のみ更新）。収集器は通常これらを訪問しないが二重の安全網。
    if (prev && isUserManagedUrl(c.url)) {
      out[c.url] = { ...prev, lastSeenAt: nowIso, lastCheckedAt: nowIso }
      continue
    }
    // 収集対象URLでも、締切未設定の課題にユーザーが手動で締切を入れていた場合（deadlineUserSet）は、
    // LETUS が締切を返さない限り（収集値 deadline===null）その締切を温存する＝再収集で消さない。
    // LETUS が実締切を返したら（deadline≠null）LETUS 権威へ戻し、印を落とす。
    const keepUserDeadline = !!prev?.deadlineUserSet && c.deadline === null
    out[c.url] = {
      ...c,
      ...(keepUserDeadline
        ? { deadline: prev!.deadline, deadlineText: prev!.deadlineText, deadlineUserSet: true as const }
        : {}),
      // コース同一性は空の収集値で塗り潰さない: 追跡解除やコース一覧の取りこぼしで urlInfo が
      // 引けなかった訪問（courseName ''）が、保存済みの実名/コードを消して「科目不明」に
      // 落とすのを防ぐ（追跡解除ダイアログの「収集済みの課題は残ります」を守る）。
      courseName: c.courseName || (prev?.courseName ?? ''),
      courseCode: c.courseCode ?? prev?.courseCode ?? null,
      ignored: prev ? prev.ignored : false,
      firstSeenAt: prev ? prev.firstSeenAt : nowIso,
      lastSeenAt: nowIso,
      lastCheckedAt: nowIso,
    }
  }
  return out
}
