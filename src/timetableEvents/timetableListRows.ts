/**
 * リスト表示時間割の行組み立て（純粋・RN非依存＝vitestで検証可能）。
 * 授業スロットと個人予定を「時限順」に統合する。従来は個人予定を全授業の後に一括で
 * 追加していたため、0限や授業と重なる予定が時限位置から切り離されて最下部に落ちていた。
 *
 * 仕様（ユーザー指定 2026-07-15）:
 * - 個人予定は最小period（複数コマなら先頭）にアンカーする。0限は period 0 なので自然に1限の上へ来る。
 * - 同じ時限に授業がある個人予定は、その授業行に内包する（授業の枠を拡張して中に表示）。
 * - 授業の無い時限の個人予定は、その時限位置の独立行にする（最下部送りにしない）。
 * - 補講オカレンスは日付限定の一回きりなので本関数では扱わない（呼び出し側が末尾に付す）。
 */
import type { PersonalEvent } from './personalEvent'

export type TimetableListRow<S> =
  | { kind: 'class'; period: number; slots: S[]; personal: PersonalEvent[] }
  | { kind: 'personal'; period: number; events: PersonalEvent[] }

/** 個人予定のアンカー時限（最小period）。periodsが空なら null（表示対象外）。 */
function anchorPeriod(e: PersonalEvent): number | null {
  return e.periods.length ? Math.min(...e.periods) : null
}

export function buildTimetableListRows<S extends { period: number }>(
  daySlots: S[],
  personal: PersonalEvent[],
): TimetableListRow<S>[] {
  // 個人予定をアンカー時限ごとに束ねる（0限含む・periods空は除外）。
  const personalByPeriod = new Map<number, PersonalEvent[]>()
  for (const e of personal) {
    const p = anchorPeriod(e)
    if (p == null) continue
    const arr = personalByPeriod.get(p)
    if (arr) arr.push(e)
    else personalByPeriod.set(p, [e])
  }
  // 授業スロットを時限ごとに束ねる（通常は時限=1スロットだが、同一時限複数スロットも落とさず保持）。
  const slotsByPeriod = new Map<number, S[]>()
  for (const s of daySlots) {
    const arr = slotsByPeriod.get(s.period)
    if (arr) arr.push(s)
    else slotsByPeriod.set(s.period, [s])
  }
  // 授業時限 ∪ 個人予定アンカー時限を昇順に。
  const periods = Array.from(new Set([...slotsByPeriod.keys(), ...personalByPeriod.keys()])).sort((a, b) => a - b)
  const rows: TimetableListRow<S>[] = []
  for (const p of periods) {
    const slots = slotsByPeriod.get(p)
    const pes = personalByPeriod.get(p) ?? []
    if (slots && slots.length > 0) rows.push({ kind: 'class', period: p, slots, personal: pes })
    else rows.push({ kind: 'personal', period: p, events: pes })
  }
  return rows
}
