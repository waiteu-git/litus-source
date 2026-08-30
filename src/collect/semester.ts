// CLASSの時間割ページは学期セレクタ(funcForm:gakki_input)で表示学期を切り替える。既定はサーバが
// 「前期」に selected を描くため、放置すると後期が永久に取れない（2026-08-27に実機で確定）。
// 収集JSは「すべて対象」を選び、前期・後期の table.classTable を両方持ち帰る。
//
// ⚠**2026-08-28に設計が変わった。** 以前は「保存の直前で1学期に絞る」だったが、ユーザー要望
// 「スワイプで戻ると前期・進めると後期」に応えるため、**保存は両学期・絞り込みは読み出し側**へ移した。
//
// 🔴**危険の中身は変わっていない。** 消費側8モジュール（focusClass / classPeriod / widget /
// attendanceSchedule / homeBanner / attendanceOpenNotify 等）は collections を**全部走査**するので、
// 2学期分をそのまま渡すと「終わった学期の授業が今日の授業として出る」「終わった科目に出席アラームが鳴る」。
// ⇒ **`loadTimetable()` が唯一の関門**（既定は「今日」で絞る）。消費側は無編集のまま守られる。
// 🔴 全学期が要るのは**時間割画面の表示だけ**＝`loadAllTimetables()` を使う。他から呼ばないこと。
//
// 判定できない時は**絞らない**（＝今日と同じ挙動へ退避する）。見出しの書式が変わった・学年暦の外に
// 居る、のどちらでも「取れているものを捨てる」方向へは倒さない。

import { academicTermRange } from '../timetableEvents/termBounds'
import { termOf, type AcademicCalendar } from '../health/academicCalendar'
import { dateToYmd } from '../timetableEvents/eventDateValue'

export type SemesterTerm = '前期' | '後期'
export type SemesterLabel = { year: number; term: SemesterTerm }

/**
 * 各 table.classTable の直前に描かれる見出し（実測＝「2026年度 前期」）から学期を取る。
 * ⚠科目名の「（前期）」は使わない＝実DOM18科目中1件しか付いておらず、マーカーとして成立しない。
 */
export function parseSemesterHeading(head: string | null | undefined): SemesterLabel | null {
  if (typeof head !== 'string') return null
  const m = head.match(/(\d{4})\s*年度\s*(前期|後期)/)
  if (!m) return null
  return { year: Number(m[1]), term: m[2] as SemesterTerm }
}

/**
 * now がどちらの学期か。学年暦の近似は termBounds が正典なので、そこから導く（月を二重に持たない）。
 * termBounds は前期=4/1〜8/7・後期=9/1〜翌2/7 で、**開始を早い側へ倒す**設計（授業日が期間外へ落ちると
 * 週送りが死ぬため）。ここでも同じ境界に乗る＝9/1以降は後期を選ぶ。
 */
export function currentSemester(now: Date, calendar?: AcademicCalendar | null): SemesterTerm | null {
  // 🔴 遠隔配信の学年暦があればそれが最優先。**学期間の日でも前後の中点で必ずどちらかに属する**ので、
  // 「表示中の週」で学期を切り替えられる（2026年度なら 8/6 と 9/11 の中点＝8/24 が境界）。
  // ⇒ 8/26 のような体感値をコードに持たない。年度がずれても配信を直せば追随する。
  const t = termOf(calendar ?? null, dateToYmd(now))
  // 期間の開始月で前期/後期を決める（idは人間用なので判定に使わない）。
  if (t) return Number(t.start.slice(5, 7)) <= 8 ? '前期' : '後期'
  // 暦が無い/古い＝従来どおり。授業期間外は null を返し、pickCurrentSemester が
  // 「最新の学期を1つ」へ退避する（＝今日と同じ挙動）。**ここで固定値を作らない。**
  const range = academicTermRange(now)
  if (!range) return null
  return range.start.getMonth() + 1 === 4 ? '前期' : '後期'
}

/** label を持つ最小の形（TimetableCollection もこれを満たす）。 */
type Labeled = { label?: string | null }

/**
 * 当該学期の要素だけに絞る。**見出しが読める限り、必ず1つに絞る。**
 *
 * 🔴**「判定できないから両方残す」にしてはいけない。** 学期の外（夏休み等）に両方を保存すると、
 * 消費側は全collectionを走査するので**後期の科目に出席アラームが鳴る**（後期科目は出欠データが
 * 無いため `courseOver` の「終了日が無い＝開講中」に落ちる）。2026-08-27の実機検証で、8月末に
 * 2枚が保存される状態を実際に作って気づいた。
 *
 * - 要素が1つ以下 …………… そのまま
 * - 見出しが1つも読めない … そのまま（**識別できないものは捨てない**。これだけが複数を残す道）
 * - 当該学期に一致がある … それだけ
 * - 一致が無い／学期の外 … **最新の学期を1つ**（年→後期>前期 の順）
 */
export function pickCurrentSemester<T extends Labeled>(
  items: T[],
  now: Date,
  calendar?: AcademicCalendar | null,
): T[] {
  if (items.length <= 1) return items
  const parsed = items.map((i) => parseSemesterHeading(i.label))
  if (parsed.every((p) => p === null)) return items

  const term = currentSemester(now, calendar)
  if (term) {
    const hit = items.filter((_, i) => parsed[i]?.term === term)
    if (hit.length > 0) return hit
  }
  // 学期の外、または当該学期の表がまだ無い（例: 9/11直前に後期がCLASSへ出ていない）。
  // 読めたものの中で最新を1つ選ぶ。読めないものは候補にしない。
  let best = -1
  let bestKey = -Infinity
  parsed.forEach((p, i) => {
    if (!p) return
    const key = p.year * 10 + (p.term === '後期' ? 1 : 0)
    if (key > bestKey) {
      bestKey = key
      best = i
    }
  })
  return best >= 0 ? [items[best]] : items
}
