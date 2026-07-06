import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  serializeAssignments,
  deserializeAssignments,
  type AssignmentMap,
} from './assignmentsSerialize'

const KEY = 'letus.assignments.v1'

export async function saveAssignments(m: AssignmentMap): Promise<void> {
  await AsyncStorage.setItem(KEY, serializeAssignments(m))
}

export async function loadAssignments(): Promise<AssignmentMap> {
  return deserializeAssignments(await AsyncStorage.getItem(KEY))
}
