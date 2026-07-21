import { Storage } from './asyncStorage'
import {
  serializeAssignments,
  deserializeAssignments,
  type Assignment,
  type AssignmentMap,
} from './assignmentsSerialize'
import { createWriteQueue } from './writeQueue'

const KEY = 'letus.assignments.v1'

// 単一ライタ: 収集完了・手動編集・既読切替などの書き込みが並走してもlost updateしない。
const enqueueWrite = createWriteQueue()

export async function loadAssignments(): Promise<AssignmentMap> {
  return deserializeAssignments(await Storage.getItem(KEY))
}

/**
 * read-modify-writeを直列キュー内で行う（lost update防止の唯一の更新入口）。
 * 呼び出し元でload→save分割せず、必ずこの経路で更新すること。更新後の全件を返す。
 */
export async function mutateAssignments(
  mutate: (m: AssignmentMap) => AssignmentMap,
): Promise<AssignmentMap> {
  return enqueueWrite(async () => {
    const next = mutate(await loadAssignments())
    await Storage.setItem(KEY, serializeAssignments(next))
    return next
  })
}

/** 1件を追加/更新（手動課題の作成・編集に使う）。 */
export async function upsertAssignment(a: Assignment): Promise<void> {
  await mutateAssignments((m) => ({ ...m, [a.url]: a }))
}

/** 1件を削除（手動課題の削除に使う）。 */
export async function removeAssignment(url: string): Promise<void> {
  await mutateAssignments((m) => {
    if (!m[url]) return m
    const next = { ...m }
    delete next[url]
    return next
  })
}
