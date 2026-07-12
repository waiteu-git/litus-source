export type AttendanceOverride = { total?: number }
export type AttendanceOverrides = Record<string, AttendanceOverride>

export function serializeAttendanceOverrides(o: AttendanceOverrides): string {
  return JSON.stringify(o)
}

export function deserializeAttendanceOverrides(raw: string | null): AttendanceOverrides {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  const out: AttendanceOverrides = {}
  for (const [code, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== 'object' || v === null) continue
    const total = (v as { total?: unknown }).total
    out[code] = typeof total === 'number' ? { total } : {}
  }
  return out
}
