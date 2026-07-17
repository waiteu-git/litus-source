import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ReceptionWindowRecord } from '../attendance/receptionWindow'
import { serializeReceptionWindow, deserializeReceptionWindow } from './receptionWindowSerialize'

/**
 * 「今日見た出席受付時間」の永続層。
 *
 * 出席済み記録（attendanceDoneStore）とは別物：あちらは**出席した後**にしか書かれないが、
 * ホームは**受付中の段階から**残り時間を出したいので、受付時間を見た時点で書く。
 *
 * 1件だけ持つ（最後に見た受付時間）。別コマの受付時間で上書きされても、読み手の
 * `homeRemaining` が windowAnchorsToPeriod で弾くため無害＝多件管理の複雑さを持ち込まない。
 *
 * 書き手は AttendanceEngineProvider の1箇所のみ＝AsyncStorage単一ライタ原則に適合
 * （read-modify-write をしないので書き込みキューも不要）。
 */
const KEY = 'attendance.receptionWindow.v1'

export async function saveReceptionWindow(r: ReceptionWindowRecord): Promise<void> {
  await AsyncStorage.setItem(KEY, serializeReceptionWindow(r))
}

export async function loadReceptionWindow(): Promise<ReceptionWindowRecord | null> {
  return deserializeReceptionWindow(await AsyncStorage.getItem(KEY))
}
