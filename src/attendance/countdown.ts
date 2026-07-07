/**
 * 受付可能時間（"12:50〜14:30" など）の終了時刻までの残りを now 基準で算出して文面化する（純粋）。
 * CLASSから取った静的な残り時間の代わりに、UIで毎秒カウントダウン表示するために使う。
 * 終了時刻ちょうど/超過は「受付終了」、時刻を含まない/nullは null。
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
