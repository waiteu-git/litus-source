import type { TimetableOverride, TimetableOverrides } from '../timetableEvents/quarter'

export function serializeTimetableOverrides(o: TimetableOverrides): string {
  return JSON.stringify(o)
}

export function deserializeTimetableOverrides(raw: string | null): TimetableOverrides {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  const out: TimetableOverrides = {}
  for (const [code, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== 'object' || v === null) continue
    const q = (v as { quarter?: unknown }).quarter
    const override: TimetableOverride = q === 'first' || q === 'second' ? { quarter: q } : {}
    out[code] = override
  }
  return out
}
