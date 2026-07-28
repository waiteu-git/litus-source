/**
 * 「この授業はもう出席登録した」状態の純粋判定（端末非依存・now注入でテスト可能）。
 * 出席完了時に記録し、その授業の受付可能時間が終わるまで「出席済み」を表示し、入力を閉じるのに使う。
 */
export type AttendedRecord = {
  /** 記録した日（YYYY-MM-DD・ローカル）。日付が変われば無効。 */
  date: string
  courseName: string
  /** 受付可能時間（"12:50〜14:30" 等）。この終了までを「その授業の間」とみなす。 */
  confirmWindow: string | null
  /**
   * 入力して送信した出席コード。授業の間は表示しておく。
   * **表示期間が終わったら空文字にする**（`withExpiredCodeCleared`）。AsyncStorage に平文で
   * 居座らせないため（監査M-1）。空 = 「このアプリで送信していない or 期限切れで消した」。
   */
  code: string
}

const p2 = (n: number) => String(n).padStart(2, '0')

export function todayKey(now: Date): string {
  return `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`
}

/**
 * 記録が「今この授業の間」で有効か。今日の記録で、次の遅い方の時刻まで true:
 *   - 受付可能時間（confirmWindow）の終了
 *   - `classEndMin`（出席した授業の時限終了・分）… 受付が早く閉じても授業終了まで出席済みを維持
 * confirmWindow も classEndMin も無ければ当日中は true（時刻情報が無いケースの安全側）。
 * classEndMin は時間割由来（呼び出し側で attendedClassEndMin を用いて算出）。
 */
/**
 * 出席済み記録を更新する際、入力コードを失わないようにマージする。
 * CLASSの .attendSuc を検出して記録し直すとき、そのセッションで送信していない（同一授業への再アクセス/
 * 別デバイスで出席）と incoming.code は空になる。**同一授業**（同日かつ科目名または受付時間が一致）の
 * 既存コードだけ引き継ぐ。別の授業（例: 前のコマにアプリで出席→今のコマはPC出席）へは引き継がない
 * ＝前授業のコードを誤表示しない。
 */
export function mergeAttendedRecord(
  prev: AttendedRecord | null,
  next: AttendedRecord,
): AttendedRecord {
  if (next.code) return next
  if (!prev || prev.date !== next.date || !prev.code) return next
  const sameCourse = !!prev.courseName && prev.courseName === next.courseName
  const sameWindow = !!prev.confirmWindow && prev.confirmWindow === next.confirmWindow
  if (sameCourse || sameWindow) return { ...next, code: prev.code }
  return next
}

/**
 * 出席記録を残してよいか（純粋）。科目名も受付時間も無い＝**何に対する出席か特定できない**ので記録しない。
 *
 * 記録してしまうと `isAttendedNow` が `ends.length === 0` の分岐で **その日ずっと true** を返し、
 * 「（科目名不明）出席済み」が居座って **後の本物の授業の出席フロー（コード入力）を塞ぐ**。
 * 実機で発生（2026-07-17・授業のない時間帯に送信 → 受付が無いため courseName='' / confirmWindow=null
 * で保存され、その日ずっと出席済み表示になった）。
 */
export function canRecordAttendance(courseName: string, confirmWindow: string | null): boolean {
  return !!courseName.trim() || !!confirmWindow
}

/**
 * 「いま出席済みとして表示してよいか」の最終判定（純粋）。**CLASSの状態が正**で、ローカル記録は
 * CLASSがそれを否定していない時だけの補助（授業間の継続表示・オフライン補助）。
 *
 * とくに `reaction_pending` は CLASS が「出席登録は完了していません／リアクションペーパーを提出して
 * ください」と**出席していないことを明示**した状態なので、ローカル記録より必ず強い。
 * ここでローカル記録を優先させると「出席済み」を表示し、AttendanceScreen では attended 分岐が
 * リアペ提出フォームより先に来るため**提出画面が到達不能になり、ユーザーは提出しないまま欠席する**
 * （実機 2026-07-17: 実DOMは attendSuc 無し＋リアペ待ちなのに出席済み表示。データ全消去で正常化＝
 *  古いローカル記録が原因と確定）。
 */
export function resolveAttendedNow(
  status: string | undefined,
  rec: AttendedRecord | null,
  now: Date,
  classEndMin: number | null = null,
): boolean {
  if (status === 'attended') return true
  if (status === 'reaction_pending') return false
  return isAttendedNow(rec, now, classEndMin)
}

export function isAttendedNow(
  rec: AttendedRecord | null,
  now: Date,
  classEndMin: number | null = null,
): boolean {
  if (!rec) return false
  if (rec.date !== todayKey(now)) return false
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const m = rec.confirmWindow?.match(/(\d{1,2}):(\d{2})\D+(\d{1,2}):(\d{2})/)
  const cwEndMin = m ? Number(m[3]) * 60 + Number(m[4]) : null
  const ends: number[] = []
  if (cwEndMin != null) ends.push(cwEndMin)
  if (classEndMin != null) ends.push(classEndMin)
  if (ends.length === 0) return true
  return nowMin <= Math.max(...ends)
}

/**
 * 表示に使い終わった出席コードを記録から落とす（純粋・監査M-1）。
 *
 * なぜ要るか: `code` は AsyncStorage（`attendance.done.v1`）に平文で入り、表示は
 * `isAttendedNow` で「その授業の間」に絞られているのに**値そのものは次の出席で上書き
 * されるか resetAllData まで消えない**。Play のデータ安全性で出席コードを「一時的に
 * 処理される」と説明する以上、実装側で寿命を表示期間に一致させる。
 *
 * 期限判定は表示と同じ `isAttendedNow` に一本化する（重複ロジックを作らない）＝
 * **「見せている間だけ持つ」が定義上保証される**。よって空コードが表示に流れることはない
 * （空にするのは isAttendedNow が false になった記録だけ）。
 * confirmWindow が無い/読めない記録は `isAttendedNow` が当日いっぱい true なので、
 * 日付が変わった時点で消える（時刻情報が無いケースの安全側）。
 *
 * 消すのは `code` だけ。`date`/`courseName`/`confirmWindow` は「この授業は出席済み」の
 * 判定・当該コマの同定に要るので残す。型も `string` のまま（`| null` にすると呼び出し側の
 * 分岐が増える）。変化が無ければ**同じ参照**を返すので、呼び出し側は `===` で
 * 「書き戻すべきか」を判定できる（毎回書くと AsyncStorage への無駄な書き込みが増える）。
 */
export function withExpiredCodeCleared(
  rec: AttendedRecord,
  now: Date,
  classEndMin?: number | null,
): AttendedRecord
export function withExpiredCodeCleared(
  rec: AttendedRecord | null,
  now: Date,
  classEndMin?: number | null,
): AttendedRecord | null
export function withExpiredCodeCleared(
  rec: AttendedRecord | null,
  now: Date,
  classEndMin: number | null = null,
): AttendedRecord | null {
  if (!rec || !rec.code) return rec
  if (isAttendedNow(rec, now, classEndMin)) return rec
  return { ...rec, code: '' }
}
