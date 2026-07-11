/**
 * 授業の週次実施パターン（カレンダー式）。「休みにした週」の集合(off)だけを持ち、
 * カレンダー上で週ごとに実施/休みを選ぶ。隔週はプリセットで交互OFFを流し込み、ズレた週だけ手で直す。
 * 端末非依存の純粋ロジック（date注入）で vitest テスト可能。
 */
export type WeeklyPattern = {
  /** 休みにした週（週=その週の月曜日キー 'YYYY-MM-DD'）の集合。キーが無い週＝実施。 */
  off?: Record<string, true>
}

/** その日が属する週の月曜日（ローカル日付）。 */
export function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = x.getDay() // 0=日..6=土
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  return x
}

/** 週の月曜日キー 'YYYY-MM-DD'（off集合のキー・表示用）。 */
export function weekMondayKey(d: Date): string {
  const m = mondayOf(d)
  const mm = String(m.getMonth() + 1).padStart(2, '0')
  const dd = String(m.getDate()).padStart(2, '0')
  return `${m.getFullYear()}-${mm}-${dd}`
}

export function defaultPattern(): WeeklyPattern {
  return {}
}

/** その日にこの授業が実施されるか（休み週に入っていなければ実施）。 */
export function isClassOnDate(p: WeeklyPattern | undefined, d: Date): boolean {
  return !p?.off?.[weekMondayKey(d)]
}

/** その週が「休み」か。 */
export function isWeekOff(p: WeeklyPattern | undefined, weekDate: Date): boolean {
  return !!p?.off?.[weekMondayKey(weekDate)]
}

/** その週の実施/休みをトグルする。 */
export function toggleWeek(p: WeeklyPattern | undefined, weekDate: Date): WeeklyPattern {
  const key = weekMondayKey(weekDate)
  const off = { ...(p?.off ?? {}) }
  if (off[key]) delete off[key]
  else off[key] = true
  return Object.keys(off).length ? { off } : {}
}

/** 週の月曜Date同士の週数差。 */
function weekDiff(a: Date, b: Date): number {
  return Math.round((mondayOf(a).getTime() - mondayOf(b).getTime()) / (7 * 86400000))
}

/**
 * 隔週プリセット：anchor 週を「実施」とし、そこから交互に休みを weeks の範囲へ流し込む（既存offは置換）。
 * anchor と偶数週差＝実施、奇数週差＝休み。あとはユーザーが個別トグルでズレを直す。
 */
export function applyBiweeklyPreset(anchorWeek: Date, weeks: Date[]): WeeklyPattern {
  const off: Record<string, true> = {}
  for (const w of weeks) {
    if (((weekDiff(w, anchorWeek) % 2) + 2) % 2 === 1) off[weekMondayKey(w)] = true
  }
  return Object.keys(off).length ? { off } : {}
}

/** 全週を実施に戻す（休み集合をクリア）。 */
export function clearPattern(): WeeklyPattern {
  return {}
}

/** カレンダー用の週リスト（各週の月曜Date）。今週の back 週前 〜 forward 週後。 */
export function weekList(now: Date, back: number, forward: number): Date[] {
  const base = mondayOf(now)
  const out: Date[] = []
  for (let i = -back; i <= forward; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i * 7)
    out.push(d)
  }
  return out
}
