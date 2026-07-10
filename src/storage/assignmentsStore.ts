import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  serializeAssignments,
  deserializeAssignments,
  type Assignment,
  type AssignmentMap,
} from './assignmentsSerialize'

const KEY = 'letus.assignments.v1'

export async function saveAssignments(m: AssignmentMap): Promise<void> {
  await AsyncStorage.setItem(KEY, serializeAssignments(m))
}

export async function loadAssignments(): Promise<AssignmentMap> {
  return deserializeAssignments(await AsyncStorage.getItem(KEY))
}

/** 1件を追加/更新（手動課題の作成・編集に使う）。 */
export async function upsertAssignment(a: Assignment): Promise<void> {
  const m = await loadAssignments()
  m[a.url] = a
  await saveAssignments(m)
}

/** 1件を削除（手動課題の削除に使う）。 */
export async function removeAssignment(url: string): Promise<void> {
  const m = await loadAssignments()
  if (m[url]) {
    delete m[url]
    await saveAssignments(m)
  }
}
