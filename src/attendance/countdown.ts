import { parseWindowMinutes } from './receptionWindow'

/**
 * 受付終了までの残り秒。**null は「受付時間が分からない」だけ**を意味し、終了済みは 0 以下の数値を返す。
 *
 * これが要る理由: countdownClock / countdownText は終了を**文字列 '受付終了' で表す**ため、
 * `clock ? A : B` のような truthy 判定では終了を検出できず、そのまま文面へ埋め込まれて
 * 「提出の受付終了まで 受付終了」のような破綻表示になる（2026-07-17 のレビューで実機再現）。
 * **状態の判定にはこちらを使い、文字列比較で状態を判定しないこと。**
 */
export function countdownRemainingSec(confirmWindow: string | null, now: Date): number | null {
  const w = parseWindowMinutes(confirmWindow)
  if (!w) return null
  const end = new Date(now)
  end.setHours(Math.floor(w.endMin / 60), w.endMin % 60, 0, 0)
  return Math.floor((end.getTime() - now.getTime()) / 1000)
}

/**
 * 受付可能時間（"12:50〜14:30" など）の終了時刻までの残りを now 基準で算出して文面化する（純粋）。
 * CLASSから取った静的な残り時間の代わりに、UIで毎秒カウントダウン表示するために使う。
 * 終了時刻ちょうど/超過は「受付終了」、時刻を含まない/nullは null。
 * **戻り値で状態を判定しないこと**（終了も非nullの文字列）。判定は countdownRemainingSec を使う。
 */
export function countdownText(confirmWindow: string | null, now: Date): string | null {
  if (!confirmWindow) return null
  const m = confirmWindow.match(/(\d{1,2}):(\d{2})\D+(\d{1,2}):(\d{2})/)
  if (!m) return null
  const end = new Date(now)
  end.setHours(Number(m[3]), Number(m[4]), 0, 0)
  let sec = Math.floor((end.getTime() - now.getTime()) / 1000)
  if (sec <= 0) return '受付終了'
  const h = Math.floor(sec / 3600)
  sec -= h * 3600
  const mm = Math.floor(sec / 60)
  const ss = sec % 60
  return h > 0 ? `あと${h}時間${mm}分` : `あと${mm}分${ss}秒`
}

function parseWindow(confirmWindow: string | null, now: Date): { start: Date; end: Date } | null {
  if (!confirmWindow) return null
  const m = confirmWindow.match(/(\d{1,2}):(\d{2})\D+(\d{1,2}):(\d{2})/)
  if (!m) return null
  const start = new Date(now)
  start.setHours(Number(m[1]), Number(m[2]), 0, 0)
  const end = new Date(now)
  end.setHours(Number(m[3]), Number(m[4]), 0, 0)
  if (end.getTime() <= start.getTime()) return null
  return { start, end }
}

/**
 * 受付可能時間の残り割合（0..1）。now が終了時刻に近づくほど 0 に向かう。リングの弧を残り時間で
 * 動かすために使う（純粋）。開始前は 1、終了後は 0、解析不能/nullは null。
 */
export function countdownFraction(confirmWindow: string | null, now: Date): number | null {
  const w = parseWindow(confirmWindow, now)
  if (!w) return null
  const total = w.end.getTime() - w.start.getTime()
  const remaining = w.end.getTime() - now.getTime()
  const frac = remaining / total
  if (frac < 0) return 0
  if (frac > 1) return 1
  return frac
}

/**
 * リング中央用の時計表示。1時間以上は `H:MM:SS`、未満は `MM:SS`。終了/超過は「受付終了」。
 * 「あと〜」の文よりも桁が安定し1行に収まる（デザインのカウントダウン表示に合わせる）。
 */
export function countdownClock(confirmWindow: string | null, now: Date): string | null {
  if (!confirmWindow) return null
  const m = confirmWindow.match(/(\d{1,2}):(\d{2})\D+(\d{1,2}):(\d{2})/)
  if (!m) return null
  const end = new Date(now)
  end.setHours(Number(m[3]), Number(m[4]), 0, 0)
  let sec = Math.floor((end.getTime() - now.getTime()) / 1000)
  if (sec <= 0) return '受付終了'
  const h = Math.floor(sec / 3600)
  sec -= h * 3600
  const mm = Math.floor(sec / 60)
  const ss = sec % 60
  const p2 = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p2(mm)}:${p2(ss)}` : `${p2(mm)}:${p2(ss)}`
}
