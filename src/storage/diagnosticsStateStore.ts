/**
 * DiagnosticsState の永続化配線（spec§5.1）。AsyncStorage 単一キー。
 *
 * ⚠ Storage ファサード（./asyncStorage）経由必須。AsyncStorage を直接 import すると
 * デモ名前空間を迂回してデモ中に実データを壊す（storageFacadeGuard ラチェットが強制）。
 *
 * reducer（applyScanOutcome）は純関数として src/health/diagnosticsState.ts にあり、
 * ここは read → reduce → write の薄い糊だけを担う。
 */

import { Storage } from './asyncStorage'
import { applyScanOutcome, type DiagnosticsState, type ScanOutcome } from '../health/diagnosticsState'
import {
  deserializeDiagnosticsState,
  serializeDiagnosticsState,
} from './diagnosticsStateSerialize'

/** AsyncStorage の保存キー（配線・UI側が共有する単一情報源・spec§5.1）。 */
export const DIAGNOSTICS_STATE_KEY = 'litus.diagnosticsState'

/** 保存済み状態を読む。未保存・破損時は null（reducer に初回として扱わせる）。 */
export async function loadDiagnosticsState(): Promise<DiagnosticsState | null> {
  return deserializeDiagnosticsState(await Storage.getItem(DIAGNOSTICS_STATE_KEY))
}

/**
 * 1スキャンサイクルの観測を畳み込んで永続化する（read-modify-write）。
 * 更新後の状態を返す（UI が即座に購読/反映できるように）。
 */
export async function recordScanOutcome(outcome: ScanOutcome): Promise<DiagnosticsState> {
  const prev = await loadDiagnosticsState()
  const next = applyScanOutcome(prev, outcome)
  await Storage.setItem(DIAGNOSTICS_STATE_KEY, serializeDiagnosticsState(next))
  return next
}
