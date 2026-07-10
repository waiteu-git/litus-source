import { eventTypeLabel } from './eventLabels'
import type { ClassEvent } from './classEvent'

export type EventNotification = { id: string; title: string; body: string; fireAt: Date }

function ymdToParts(ymd: string): [number, number, number] | null {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? [Number(m[1]), Number(m[2]) - 1, Number(m[3])] : null
}
function at(ymd: string, h: number, min: number): Date | null {
  const p = ymdToParts(ymd)
  return p ? new Date(p[0], p[1], p[2], h, min, 0, 0) : null
}
function dayBefore(ymd: string, h: number, min: number): Date | null {
  const d = at(ymd, h, min)
  if (!d) return null
  d.setDate(d.getDate() - 1)
  return d
}

/** イベントの通知予定を生成。fireAt<=now は除外。補講未定/なしは通知しない。 */
export function buildClassEventNotifications(events: ClassEvent[], now: Date): EventNotification[] {
  const out: EventNotification[] = []
  const push = (id: string, title: string, body: string, when: Date | null) => {
    if (when && when.getTime() > now.getTime()) out.push({ id, title, body, fireAt: when })
  }
  const twoStage = (id: string, title: string, body: string, ymd: string) => {
    push(`${id}:eve`, title, body, dayBefore(ymd, 20, 0))
    push(`${id}:day`, title, body, at(ymd, 8, 0))
  }
  for (const e of events) {
    const name = e.courseName
    if (e.type === 'quiz' || e.type === 'midterm' || e.type === 'final') {
      twoStage(e.id, `${name} ${eventTypeLabel(e.type)}`, `${e.date} ${e.periods.join('・')}限`, e.date)
    } else if (e.type === 'cancel') {
      push(`${e.id}:day`, `${name} 休講`, `${e.date}`, at(e.date, 8, 0))
      if (e.makeupStatus === 'has' && e.makeup) {
        twoStage(`${e.id}:mk`, `${name} 補講`, `${e.makeup.date} ${e.makeup.periods.join('・')}限`, e.makeup.date)
      }
    } else if (e.type === 'makeup') {
      twoStage(e.id, `${name} 補講`, `${e.date} ${e.periods.join('・')}限`, e.date)
    } else if (e.type === 'roomChange') {
      push(`${e.id}:day`, `${name} 教室変更`, `${e.date} → ${e.room ?? ''}`, at(e.date, 8, 0))
    } else {
      push(`${e.id}:day`, `${name} ${eventTypeLabel(e.type)}`, `${e.date}`, at(e.date, 8, 0))
    }
  }
  return out
}
