// 時間割の「今週」日付（純粋関数・React Native非依存）。
// 時間割自体は日付に紐づかない毎週同じテンプレートだが、today 基準で今週（月曜起点）の
// 各曜日の実日付を算出し、曜日ヘッダの日付・週範囲ラベルの表示に使う（週送りは持たない＝常に今週）。
export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

const ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

/** today を含む週の月曜（ローカル0:00）を返す。日曜は同じ週の始まりの月曜（6日前）へ寄せる。 */
export function mondayOf(today: Date): Date {
  const dow = today.getDay() // 0=日..6=土
  const offset = dow === 0 ? -6 : 1 - dow
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset)
}

/** monday(週起点) から各曜日 → その週の Date。 */
export function weekDatesFrom(monday: Date): Record<DayKey, Date> {
  const out = {} as Record<DayKey, Date>
  ORDER.forEach((d, i) => {
    out[d] = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
  })
  return out
}

/** 各曜日 → その週の Date（today を含む週）。 */
export function weekDates(today: Date): Record<DayKey, Date> {
  return weekDatesFrom(mondayOf(today))
}

/** 起点月曜＋表示曜日集合（順序つき）から週範囲ラベル「M月D日〜M月D日」。空なら空文字。 */
export function weekRangeLabelFrom(monday: Date, days: readonly DayKey[]): string {
  if (days.length === 0) return ''
  const wd = weekDatesFrom(monday)
  const first = wd[days[0]]
  const last = wd[days[days.length - 1]]
  const fmt = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日`
  return days.length === 1 ? fmt(first) : `${fmt(first)}〜${fmt(last)}`
}

/** 表示中の曜日集合（順序つき）から週範囲ラベル（today を含む週）。 */
export function weekRangeLabel(today: Date, days: readonly DayKey[]): string {
  return weekRangeLabelFrom(mondayOf(today), days)
}

/** 日ビューの日ヘッダ「M月D日（曜）」を作る。dow は曜日1文字（月/火/…）。 */
export function dayHeadLabel(date: Date, dow: string): string {
  return `${date.getMonth() + 1}月${date.getDate()}日（${dow}）`
}
