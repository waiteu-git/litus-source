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
import type { TimetableCollection } from '../collect/timetableMessage'
import type { Quarter } from '../parsers/timetable'
import { pickFocusClass, type FocusClass } from '../home/focusClass'
import { DEMO_TIMETABLE } from '../demo/demoFixtures'

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

/**
 * デモで「受付中」として見せるコマ。**時間割から引く（定数にしない）。**
 *
 * 科目名をハードコードしていた頃は、何時に開いても月1の科目が受付中になり、
 * 月曜13:15 にホームが「いまの授業＝月3の科目」、出席が「受付中＝月1の科目」と
 * 名指しする矛盾が実際に出ていた。ホームのヒーローと同じ pickFocusClass を通すことで、
 * 授業時間帯では**必ず同じ科目**になる（ホームバナー/FABの findActiveClass とも一致）。
 *
 * **該当コマが無い時間帯（早朝・深夜・日曜）の設計判断＝「次に出席を取るコマ」を見せる。**
 * 正直に「受付なし」を出す案も検討したが、時間割を厚くしても授業時間帯は週の約4分の1しか
 * 無く、審査員が開いた時刻の4回に3回は出席送信フロー自体が見えないことになる。
 * これは 2.1(a) が求める "full features and functionality" を正面から落とす。
 * 一方、授業時間外はホームのヒーローも時間割の「実施中」ハイライトも出ないので、
 * **画面上で科目を名指しして食い違う相手がいない**＝矛盾の見え方が桁違いに小さい。
 * 見せるコマは常にデモ時間割に実在するコマなので、審査員が時間割を突き合わせても
 * 「その科目は存在する」ところまでは合う。
 */
export function pickDemoAttendanceClass(
  collections: TimetableCollection[],
  now: Date,
  currentQuarter?: Quarter,
): FocusClass | null {
  // 進行中→本日の後続、までは pickFocusClass と完全に同一（ホームと同じ判定を共有する）。
  const today = pickFocusClass(collections, now, undefined, currentQuarter)
  if (today) return today
  // 本日ぶんが尽きたら翌日以降へ。各日の 00:00 で引けば「その日の最初のコマ」が返る。
  for (let d = 1; d <= 7; d++) {
    const midnight = new Date(now)
    midnight.setDate(midnight.getDate() + d)
    midnight.setHours(0, 0, 0, 0)
    const next = pickFocusClass(collections, midnight, undefined, currentQuarter)
    if (next) return next
  }
  return null
}

/**
 * 受付中として見せる科目名。
 *
 * 時間割が未読込（`[]`）のときはデモ時間割そのものから引く。ストアからの読み込みは
 * 非同期なので、初回レンダーで空文字を出すと「（科目名不明）」が一瞬見える。
 * 定数に戻さないのは、定数と時間割が食い違ったのが元のバグそのものだから。
 */
export function demoAttendanceCourse(
  collections: TimetableCollection[],
  now: Date,
  currentQuarter?: Quarter,
): string {
  const src = collections.length > 0 ? collections : DEMO_TIMETABLE
  return pickDemoAttendanceClass(src, now, currentQuarter)?.name ?? ''
}

export function demoOverrides(a: {
  attended: AttendedRecord | null
  submit: () => void
  now: Date
  timetable: TimetableCollection[]
  currentQuarter?: Quarter
}): Partial<AttendanceEngineValue> {
  const { attended, submit, now, timetable, currentQuarter } = a
  // 出席後は記録した科目を出す。送信直後にコマが切り替わっても表示が入れ替わらないようにする。
  const courseName = attended?.courseName || demoAttendanceCourse(timetable, now, currentQuarter)
  return {
    phase: attended ? 'result' : 'ready',
    reception: {
      status: attended ? 'attended' : 'accepting',
      accepting: !attended,
      courseName,
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
