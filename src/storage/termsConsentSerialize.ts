/** 同意済み規約版のserialize。null/壊れJSON/非数値は 0（=未同意扱い）。 */
export function serializeTermsConsent(version: number): string {
  return JSON.stringify(version)
}

export function deserializeTermsConsent(raw: string | null): number {
  if (!raw) return 0
  try {
    const v = JSON.parse(raw)
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
  } catch {
    return 0
  }
}
