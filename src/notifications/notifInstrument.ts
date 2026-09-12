/**
 * 通知の計器の1行（純粋・RN非依存・N1 §4.6）。「不具合の報告」の下書きの「■ アプリ・端末」に載る。
 * 🔴 ASCII だけ・科目名を出さない（payload に科目名があっても読まない）。載るのは件数と次の出席の時刻だけ。
 * 例: `notif att=10 dupe=0 legacy=0 next=09-14T10:30 asg=18 fail=0 open=1`
 *  att＝保留中の出席の件数／dupe＝同じ種類・同じ時刻（分）の出席のうち2件目以降の数／legacy＝決まった形でない identifier の数（移行後は0）
 *  next＝次の出席の発火時刻（ローカル。payload の fireAt から読む＝iOS は保留から時刻を読めない）
 *  asg＝課題と各回イベントの件数／fail＝起動してからの予約失敗の数／open＝当日の受付open 済みのコマの数
 */
import { ATTENDANCE_TAG, ASSIGNMENT_TAG, CLASS_EVENT_TAG } from './notificationTags'
import { isAttendanceNoticeId } from './attendanceSchedule'
import type { PendingRequestLike } from './attendanceSync'

const p2 = (n: number) => String(n).padStart(2, '0')

export function formatNotifLine(input: {
  pending: readonly PendingRequestLike[]
  failures: number
  announced: readonly string[]
  now: Date
}): string {
  const att = input.pending.filter((p) => p.data?.tag === ATTENDANCE_TAG)
  const legacy = att.filter((p) => !isAttendanceNoticeId(p.identifier)).length
  const seen = new Set<string>()
  const times: number[] = []
  let dupe = 0
  for (const p of att) {
    const raw = p.data?.fireAt
    if (typeof raw !== 'string') continue
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) continue
    times.push(d.getTime())
    const minuteKey = `${String(p.data?.kind)}|${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}`
    if (seen.has(minuteKey)) dupe++
    else seen.add(minuteKey)
  }
  let next = '-'
  if (times.length > 0) {
    const d = new Date(Math.min(...times))
    next = `${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`
  }
  const asg = input.pending.filter((p) => p.data?.tag === ASSIGNMENT_TAG || p.data?.tag === CLASS_EVENT_TAG).length
  const today = `${input.now.getFullYear()}${p2(input.now.getMonth() + 1)}${p2(input.now.getDate())}`
  const open = input.announced.filter((id) => id.startsWith(`att:s:${today}-`)).length
  return `notif att=${att.length} dupe=${dupe} legacy=${legacy} next=${next} asg=${asg} fail=${input.failures} open=${open}`
}
