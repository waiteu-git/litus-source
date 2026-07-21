/**
 * デモモードで出席エンジンの context に被せる値（純粋・RN非依存）。
 *
 * デモでは running=false でエンジンが動かず、受付状態が出ないため送信フローを
 * 審査員に見せられない。Apple は 2.1 のデモモードに "exhibits your app's full
 * features and functionality" を要求し、Apple公式スタッフも "demonstration modes
 * that exhibit full features and functionality **while using demonstration data**"
 * と書いている。よって受付中の見た目を作り、送信を端末内で完結させる。
 *
 * **ネットワークには一切出ない。**記録先もデモ名前空間（Storage 経由）。
 */
import type { AttendanceEngineValue } from './AttendanceEngineProvider'
import type { AttendedRecord } from './attendedState'

/** デモの出席で見せる科目と受付時間（demoFixtures の月1と揃える）。 */
export const DEMO_ATTENDANCE_COURSE = '情報リテラシー演習'
export const DEMO_ATTENDANCE_WINDOW = '09:00〜10:30'

export function demoOverrides(
  attended: AttendedRecord | null,
  submit: () => void,
): Partial<AttendanceEngineValue> {
  return {
    phase: attended ? 'result' : 'ready',
    running: true,
    reception: {
      status: attended ? 'attended' : 'accepting',
      accepting: !attended,
      courseName: DEMO_ATTENDANCE_COURSE,
      confirmWindow: DEMO_ATTENDANCE_WINDOW,
      remaining: attended ? null : '残り 12 分',
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
