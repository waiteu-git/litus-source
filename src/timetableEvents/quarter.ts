// 半期(クォーター)科目の解決ロジック（LTW src/core/timetableLink.ts から移植・RN非依存・vitest対象）。
// CLASSは1Q/2Qを公開しない＝前半/後半はユーザー指定が唯一の情報源。同一曜限に2科目積まれていること自体が
// 半期科目のシグナル（通期は同曜限に2つ並ばない）。積みでない/未指定コマは薄くしない（消さず全件見せる）。
import type { TimetableClass, TimetableSlot, Quarter } from '../parsers/timetable'

/** courseCode → 半期指定などの表示上書き（保存はストア層・型はここが正典）。将来 room 拡張余地。 */
export type TimetableOverride = { quarter?: Quarter }
export type TimetableOverrides = Record<string, TimetableOverride>

/** 同一コマに2科目以上＝半期科目の可能性が高いコマ。 */
export function isQuarterSlot(slot: TimetableSlot): boolean {
  return slot.classes.length >= 2
}

/**
 * 「今が前半か後半か」の日付からの既定値。正確な境界日はCLASSに無く年度で動くため既定値のみ。
 * 前期(4–9月): 4–5月=前半 / 6–9月=後半、後期(10–3月): 10–11月=前半 / 12–3月=後半。
 */
export function defaultCurrentQuarter(now: Date): Quarter {
  const m = now.getMonth() + 1
  return m === 4 || m === 5 || m === 10 || m === 11 ? 'first' : 'second'
}

/** 表示に使う「現在の半期」。手動指定(pref)が最優先、無ければ日付からの既定値。 */
export function resolveCurrentQuarter(pref: Quarter | null, now: Date): Quarter {
  return pref ?? defaultCurrentQuarter(now)
}

/** 積みコマの科目を薄表示すべきか。前半/後半が指定済みで現在の半期と異なるときだけ true。 */
export function isDimmedForCurrentQuarter(
  quarter: Quarter | undefined,
  currentQuarter: Quarter,
  stacked: boolean,
): boolean {
  return stacked && quarter !== undefined && quarter !== currentQuarter
}

/** courseCode→quarter の override を、保存済みslotへ焼き込まず表示直前にマージ（LTW applyOverrides と同型）。 */
export function applyQuarterOverrides(slots: TimetableSlot[], overrides: TimetableOverrides): TimetableSlot[] {
  return slots.map((s) => ({
    ...s,
    classes: s.classes.map((c) => {
      const ov = overrides[c.courseCode]
      return ov && ov.quarter !== undefined ? { ...c, quarter: ov.quarter } : c
    }),
  }))
}

/**
 * スロットの代表科目（ホーム/バナー/ウィジェットの「今の授業」用）。積みコマは現在半期に該当する科目を優先、
 * 該当が無い/積みでない/現在半期未指定(undefined)は先頭（後方互換）。
 */
export function representativeClass(classes: TimetableClass[], currentQuarter?: Quarter): TimetableClass | undefined {
  if (classes.length === 0) return undefined
  if (classes.length === 1 || currentQuarter === undefined) return classes[0]
  return classes.find((c) => c.quarter === currentQuarter) ?? classes[0]
}
