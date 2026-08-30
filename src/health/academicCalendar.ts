/**
 * 学年暦（学期の授業実施期間）を status.json から受け取り、日付の帰属を判定する純粋ロジック。
 *
 * 動機（2026-08-28 ユーザー要望）:「前期後期の切り替えや通知の無効化期間などは年によって
 * 変わると思うし、いちいちアップデートで対応するのではなく kill switch と同じような機構で」。
 * ⇒ 学年暦を**コードの固定値でなく配信データ**にする。A+Bの学期切替境界（当初は 8/26 という
 * ユーザーの体感値をコードへ焼く予定だった）もここから導出され、固定値が1つ消える。
 *
 * 🔴**fail-open が絶対条件。** 暦が「無い／壊れている／古い」ときは `'unknown'` を返し、
 * 呼び出し側は**従来どおりの挙動（＝通知を出す）**へ倒す。ここを fail-closed にすると
 * オフラインの利用者の出席通知が全部消える。
 */

/** 授業実施期間。start/end は 'YYYY-MM-DD'、end はその日を含む。 */
export type CalendarTerm = { id: string; start: string; end: string }
export type AcademicCalendar = { terms: CalendarTerm[] }

/**
 * `'in'`   … その日は授業実施期間の中
 * `'between'` … 期間の外だが**この先に始まる期間がある**＝学期間の休み（**ここだけが抑制対象**）
 * `'unknown'` … 暦が無い/壊れている/**未来の期間が1つも無い＝暦が古い**（⇒ fail-open）
 */
export type ClassPeriodStatus = 'in' | 'between' | 'unknown'

const YMD = /^\d{4}-\d{2}-\d{2}$/
/** 1回の配信で持てる期間数の上限（暴走データで無駄な走査をしない）。 */
const MAX_TERMS = 20

/**
 * status.json の `calendar` を正規化する。壊れた要素は落とし、1つも残らなければ null。
 * ⚠ **この枠が壊れていても kill switch 本体を巻き込まない**（呼び出し側で切り分ける）。
 */
export function parseAcademicCalendar(raw: unknown): AcademicCalendar | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const termsRaw = (raw as Record<string, unknown>).terms
  if (!Array.isArray(termsRaw)) return null
  const terms: CalendarTerm[] = []
  for (const t of termsRaw.slice(0, MAX_TERMS)) {
    if (typeof t !== 'object' || t === null || Array.isArray(t)) continue
    const r = t as Record<string, unknown>
    const { id, start, end } = r
    if (typeof start !== 'string' || !YMD.test(start)) continue
    if (typeof end !== 'string' || !YMD.test(end)) continue
    if (start > end) continue // 逆転した期間は捨てる（黙って全期間扱いにしない）
    terms.push({ id: typeof id === 'string' ? id : '', start, end })
  }
  if (terms.length === 0) return null
  terms.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
  return { terms }
}

/** その日が授業実施期間の中か、学期間か、判定できないか。 */
export function classPeriodStatus(cal: AcademicCalendar | null, dateKey: string): ClassPeriodStatus {
  if (!cal || cal.terms.length === 0 || !YMD.test(dateKey)) return 'unknown'
  for (const t of cal.terms) if (dateKey >= t.start && dateKey <= t.end) return 'in'
  // 🔴 未来の期間が1つも無い＝**暦の更新忘れ**。ここで 'between' を返すと、2026年に配った暦の
  // まま2027年を迎えた利用者が**永久に黙る**。更新忘れは悪意でなく普通に起きるので、
  // 「古い暦は効かせない」を唯一の自動復帰路にする。
  if (cal.terms.some((t) => t.start > dateKey)) return 'between'
  return 'unknown'
}

/**
 * その日がどの学期に属するか（A+Bの学期切替が使う）。
 * 期間内ならその期間。学期間なら**前後の期間の中点**で分ける＝境界が暦から導出され、
 * 「8/26」のような体感値をコードに持たない（2026年なら 8/7 と 9/11 の中点＝約 8/24）。
 * 判定できないときは null（呼び出し側が従来の近似へ退避する）。
 */
export function termOf(cal: AcademicCalendar | null, dateKey: string): CalendarTerm | null {
  if (!cal || cal.terms.length === 0 || !YMD.test(dateKey)) return null
  for (const t of cal.terms) if (dateKey >= t.start && dateKey <= t.end) return t
  const next = cal.terms.find((t) => t.start > dateKey) ?? null
  const prevs = cal.terms.filter((t) => t.end < dateKey)
  const prev = prevs.length > 0 ? prevs[prevs.length - 1] : null
  if (!next) return null // 古い暦＝classPeriodStatus と同じく効かせない
  if (!prev) return next // 最初の期間より前＝これから始まる学期に属させる
  return dateKey < midpoint(prev.end, next.start) ? prev : next
}

/** 'YYYY-MM-DD' 2つの中点（前半に倒す＝境界日は次の学期側）。ローカル日付で計算する。 */
function midpoint(a: string, b: string): string {
  const da = toDate(a).getTime()
  const db = toDate(b).getTime()
  const mid = new Date(da + Math.floor((db - da) / 2))
  return `${mid.getFullYear()}-${String(mid.getMonth() + 1).padStart(2, '0')}-${String(mid.getDate()).padStart(2, '0')}`
}

function toDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}
