import type { TimetableCollection } from '../collect/timetableMessage'
import type { CampusPeriodTimes, DayOfWeek } from '../parsers/timetable'

const WEEKDAY: Record<DayOfWeek, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }

function hhmmToMin(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * now がどの時限の時間帯内かを返す（[開始,終了] 内なら その時限番号）。どの時限でもなければ null。
 * 時間割で「今のコマ」を強調表示するのに使う純粋関数。曜日は問わない（表示側で今日と突き合わせる）。
 */
export function currentPeriodNumber(periodTimes: CampusPeriodTimes | null, now: Date): number | null {
  const nowMin = now.getHours() * 60 + now.getMinutes()
  for (const p of periodTimes?.periods ?? []) {
    const s = hhmmToMin(p.start)
    const e = hhmmToMin(p.end)
    if (s === null || e === null) continue
    if (nowMin >= s && nowMin <= e) return p.period
  }
  return null
}

/**
 * 出席した授業の「時限終了時刻（分）」を返す純粋関数。confirmWindow の開始時刻がどの登録授業の
 * 時限に入るか（今日の曜日）を突き合わせ、その時限の end を返す。該当が無い / confirmWindow が
 * 読めなければ null。
 *
 * 用途: 受付可能時間が授業より早く閉じても、「出席済み」表示を授業終了まで延長する（次の授業＝
 * 別時限が始まれば confirmWindow はその時限に入らないので自然に切れる）。開始時刻でアンカーする
 * ことで、出席した当該コマにだけ延長が効く（now でアンカーすると次コマへ誤って延長するため不可）。
 */
export function attendedClassEndMin(
  collections: TimetableCollection[],
  now: Date,
  confirmWindow: string | null,
): number | null {
  const cw = confirmWindow?.match(/(\d{1,2}):(\d{2})/)
  if (!cw) return null
  const atMin = Number(cw[1]) * 60 + Number(cw[2])
  const weekday = now.getDay()
  for (const col of collections) {
    const periods = col.periodTimes?.periods ?? []
    for (const slot of col.slots) {
      if (slot.classes.length === 0) continue
      if (WEEKDAY[slot.day] !== weekday) continue
      const pt = periods.find((p) => p.period === slot.period)
      if (!pt) continue
      const start = hhmmToMin(pt.start)
      const end = hhmmToMin(pt.end)
      if (start === null || end === null) continue
      // 受付は授業開始よりわずかに前から始まる場合があるため 10 分の前余裕を持たせる。
      if (atMin >= start - 10 && atMin <= end) return end
    }
  }
  return null
}

/**
 * now が「登録授業のある時限の時間帯内」か（開始 preMinutes 前〜終了まで）を判定する純粋関数。
 *
 * 背景: CLASS は授業時間帯にログインすると、ホームではなく**モバイル出席登録**画面を出す。
 * リタスもこれに合わせ、授業中はアプリ起動時の既定タブを「出席」にするための判定に使う。
 * 端末非依存・now注入で決定論的（vitestでテスト可能）。
 */
export function isInClassPeriod(
  collections: TimetableCollection[],
  now: Date,
  preMinutes = 5,
): boolean {
  const weekday = now.getDay()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  for (const col of collections) {
    const periods = col.periodTimes?.periods ?? []
    for (const slot of col.slots) {
      if (slot.classes.length === 0) continue
      if (WEEKDAY[slot.day] !== weekday) continue
      const pt = periods.find((p) => p.period === slot.period)
      if (!pt) continue
      const start = hhmmToMin(pt.start)
      const end = hhmmToMin(pt.end)
      if (start === null || end === null) continue
      if (nowMin >= start - preMinutes && nowMin <= end) return true
    }
  }
  return false
}
