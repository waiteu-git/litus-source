/**
 * デモモードで出席エンジンの context に被せる値（純粋・RN非依存）。
 *
 * デモでは running=false でエンジンが動かず、受付状態が出ないため送信フローを
 * 審査員に見せられない。Apple は 2.1 のデモモードに "exhibits your app's full
 * features and functionality" を要求し、Apple公式スタッフも "demonstration modes
 * that exhibit full features and functionality **while using demonstration data**"
 * と書いている。よって受付中の見た目を作り、送信を端末内で完結させる。
 *
 * **ネットワークには一切出ない。**
 *
 * running は偽らない。SyncProvider が running を「授業中」の判定に使っており、
 * true にすると時間割の引っ張り更新で「授業中です／出席の自動確認が一時的に
 * 止まりますが…」という文脈に合わない確認ダイアログが出るため。
 * デモ出席の記録は React state のみで、永続化はしない（アプリ再起動で消える）。
 */
import type { AttendanceEngineValue } from './AttendanceEngineProvider'
import type { AttendedRecord } from './attendedState'

/** デモの出席で見せる科目。 */
export const DEMO_ATTENDANCE_COURSE = '情報リテラシー演習'

const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/**
 * 受付時間は now 基準で作る。固定値にすると、その時刻を外れた瞬間に
 * 「受付中」ピルと「受付終了」カウントダウンが同時に出て矛盾する（画面は
 * confirmWindow から残り時間を計算するため）。now を跨ぐ窓にすれば整合する。
 */
export function demoWindow(now: Date): string {
  const from = new Date(now.getTime() - 5 * 60000)
  const to = new Date(now.getTime() + 25 * 60000)
  return `${hhmm(from)}〜${hhmm(to)}`
}

export function demoOverrides(
  attended: AttendedRecord | null,
  submit: () => void,
  now: Date = new Date(),
): Partial<AttendanceEngineValue> {
  return {
    phase: attended ? 'result' : 'ready',
    reception: {
      status: attended ? 'attended' : 'accepting',
      accepting: !attended,
      courseName: DEMO_ATTENDANCE_COURSE,
      confirmWindow: demoWindow(now),
      remaining: null,
      error: null,
      network: 'on',
      reactionAvailable: false,
      reactionSubmitted: false,
    },
    result: attended
      ? { result: '出席を登録しました（デモ）', ok: true, wrong: false, err: false }
      : null,
    attended,
    attendedNow: attended !== null,
    submit,
    conflict: false,
    conflictExhausted: false,
    failCount: 0,
  }
}
