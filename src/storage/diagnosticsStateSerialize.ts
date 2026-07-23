/**
 * DiagnosticsState の serialize/deserialize（純粋・spec§5.1）。
 *
 * 永続化した状態は次回起動時に信頼できない入力として扱う: 破損JSON・型不正・
 * 未知の診断コード（版差でコード集合が変わった旧データ）を全て安全側へ落とす。
 * 復元不能なら null を返し、reducer に「初回（prev無し）」として扱わせる
 * （中立の空履歴＝古い壊れた active を復活させない）。
 */

import { DIAGNOSTIC_CODES, type DiagnosticCode } from '../health/diagnose'
import type { DiagnosticsState } from '../health/diagnosticsState'

const CODE_SET: ReadonlySet<string> = new Set(DIAGNOSTIC_CODES)

export function serializeDiagnosticsState(state: DiagnosticsState): string {
  return JSON.stringify(state)
}

/** 出現順を保ち、既知コードのみ・重複なしに正規化する。未知コードは捨てる。 */
function sanitizeCodes(value: unknown): DiagnosticCode[] {
  if (!Array.isArray(value)) return []
  const out: DiagnosticCode[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string' || !CODE_SET.has(item) || seen.has(item)) continue
    seen.add(item)
    out.push(item as DiagnosticCode)
  }
  return out
}

/**
 * null / 壊れJSON / 非オブジェクト / 必須フィールド型不正 は null（＝初回扱い）。
 * updatedAt は必須（この状態を書いた時刻）。lastGoodAt は null 可（一度も成功が無い状態）。
 */
export function deserializeDiagnosticsState(raw: string | null): DiagnosticsState | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const p = parsed as Record<string, unknown>

  if (typeof p.updatedAt !== 'string') return null
  if (p.lastGoodAt !== null && typeof p.lastGoodAt !== 'string') return null
  if (typeof p.consecutiveFailures !== 'number' || !Number.isFinite(p.consecutiveFailures)) {
    return null
  }

  // activeCodes は hard のみ（info混入は捨てる）。isInfoDiagnosticCode は
  // diagnosticsState 側にあるが循環回避のため、ここでは既知コードへの正規化に留め、
  // hard/info の再選別は reducer（applyScanOutcome の carriedActive フィルタ）に委ねる。
  return {
    lastGoodAt: p.lastGoodAt === null ? null : (p.lastGoodAt as string),
    consecutiveFailures: p.consecutiveFailures,
    activeCodes: sanitizeCodes(p.activeCodes),
    infoCodes: sanitizeCodes(p.infoCodes),
    lastCodes: sanitizeCodes(p.lastCodes),
    updatedAt: p.updatedAt,
  }
}
