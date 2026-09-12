/**
 * 受付open と出席済みの取り下げの「順番」（純粋・I/O は引数・N1 §4.3・§4.4）。
 * notifier.ts を import するモジュールは vitest から読めない（notificationTags.ts の冒頭）ので、順番はここに置いて T17 で固定する。
 * 配線（notifier・ストアの関数を渡すだけ）は attendanceOpenFlow.ts。
 *
 * 🔴 禁止事項2: まだ鳴っていない開始アラームの取り消しは、受付open の提示が**確かめられた後**にだけ行う。
 *   確かめ＝getPresented に自分の identifier（タグ attendance-open）が現れたこと。present の promise の解決では判定しない
 *   （前面の提示は JS ハンドラの応答を待ち、3秒で打ち切ると提示しないが、promise はその前に解決する）。
 * 🔴 iOS では保留中の X と同じ identifier で提示すると、成否が分かる前に X が置き換わって消える＝提示前の取り消しと同じ。
 *   ⇒ X の identifier を使うのは、X が**配信済み**の時（a）だけ。まだ鳴っていない X がある時（b）は別の identifier で出す。
 */
import { ATTENDANCE_OPEN_TAG } from './notificationTags'
import type { AttendanceNotice } from './attendanceSchedule'
import type { AttendanceStatus } from '../collect/attendanceMessage'
import { todayKey, type AttendedRecord } from '../attendance/attendedState'
import {
  attendanceOpenKey,
  buildAttendanceOpenContent,
  claimAttendanceOpen,
  matchAttendedSlots,
  matchOpenSlot,
  shouldNotifyAttendanceOpen,
  shouldReplaceQuietly,
  type DeliveredLike,
} from './attendanceOpenNotify'

/** 提示を確かめる時間（ハンドラの打ち切り3秒＋余裕）。 */
export const PRESENT_CONFIRM_MS = 4000
/** 確かめる間隔。 */
export const PRESENT_POLL_MS = 250

/** b の identifier（`open:` ＋ attendanceOpenKey の値）。X と別にする（禁止事項2）。 */
export function openIdentifier(key: string): string {
  return `open:${key}`
}

export type OpenPresentRequest = {
  /** null＝expo の既定（uuid）。 */
  identifier: string | null
  title: string
  body: string
  data: { tag: string; slotId?: string; quiet?: true }
  /** false＝通知ごとの content.sound=false（チャンネル属性には触れない）。 */
  sound: boolean
}

export type AttendanceOpenIO = {
  loadNotified: () => Promise<string[]>
  mutateNotified: (mutate: (keys: string[]) => string[]) => Promise<string[]>
  todayNotices: () => AttendanceNotice[]
  enqueue: <T>(task: () => Promise<T>) => Promise<T>
  getPresented: () => Promise<DeliveredLike[]>
  present: (req: OpenPresentRequest) => Promise<void>
  cancelScheduled: (identifier: string) => Promise<void>
  clearDeliveredStart: (courseCode: string | null) => Promise<void>
  recordAnnounced: (slotId: string) => Promise<void>
  sleep: (ms: number) => Promise<void>
  clock: () => number
}

export type AttendanceOpenInput = {
  status: AttendanceStatus
  courseName: string | null
  confirmWindow: string | null
  now: Date
  attendedNow: boolean
  attendanceFocused: boolean
  /** 科目別OFF の判定と c の畳み込みに使う（courseCodeByName の値。引けなければ null）。 */
  courseCode: string | null
  courseDisabled: boolean
}

export type AttendanceOpenOutcome =
  | 'skipped'
  | 'quiet-replaced'
  | 'announced'
  | 'unmatched'
  | 'unconfirmed'
  | 'present-failed'

async function confirmPresented(
  io: Pick<AttendanceOpenIO, 'getPresented' | 'sleep' | 'clock'>,
  identifier: string,
): Promise<boolean> {
  const deadline = io.clock() + PRESENT_CONFIRM_MS
  for (;;) {
    const list = await io.getPresented().catch(() => [] as DeliveredLike[])
    // a はトレイに同じ identifier の開始アラームが先にあるので、タグが attendance-open に変わったことで確かめる。
    if (list.some((n) => n.identifier === identifier && n.data?.tag === ATTENDANCE_OPEN_TAG)) return true
    if (io.clock() >= deadline) return false
    await io.sleep(PRESENT_POLL_MS)
  }
}

/**
 * 受付open の通知（§4.3）。1. 登録（提示の前・同じ mutate の中）→ 2. コマの照合（M1）→ 3. 出席の直列キューの中で
 * a/b/c の提示 → d. 確認 → b だけ X の保留を取り消す → a/b は記録。e. 失敗・確かめられない時は何も取り消さず記録もしない。
 */
export async function runAttendanceOpenSequence(
  io: AttendanceOpenIO,
  input: AttendanceOpenInput,
): Promise<AttendanceOpenOutcome> {
  const key = attendanceOpenKey({ courseName: input.courseName, confirmWindow: input.confirmWindow, now: input.now })
  const claimInput = {
    status: input.status,
    attendedNow: input.attendedNow,
    attendanceFocused: input.attendanceFocused,
    key,
    courseDisabled: input.courseDisabled,
    today: todayKey(input.now),
  }
  // 軽い事前判定（30秒ポーリングのたびに書き込まない）。確定は下の mutate の中で行う。
  if (!shouldNotifyAttendanceOpen({ ...claimInput, notifiedKeys: await io.loadNotified() })) return 'skipped'
  // 1. 登録（提示の前）。登録したキーは提示に失敗しても戻さない（掲示・LETUS と同じ割り切り）。
  let claimed = false
  await io.mutateNotified((keys) => {
    const r = claimAttendanceOpen(keys, claimInput)
    claimed = r.claimed
    return r.next
  })
  if (!claimed) return 'skipped'
  // 2. どのコマか（M1）。
  const slotId = matchOpenSlot(io.todayNotices(), input.courseName, input.now)
  const content = buildAttendanceOpenContent({ courseName: input.courseName, confirmWindow: input.confirmWindow })
  // 3. 出席の直列キューの中で。貼り直しが割り込んで、取り消した X を貼り直さないように（§4.5）。
  return io.enqueue(async (): Promise<AttendanceOpenOutcome> => {
    if (slotId === null) {
      // c: コマ不明＝今と同じ（既定の uuid・提示の後に配信済みの開始アラームを畳む）。保留は触らない。
      try {
        await io.present({ identifier: null, ...content, data: { tag: ATTENDANCE_OPEN_TAG }, sound: true })
      } catch {
        return 'present-failed'
      }
      await io.clearDeliveredStart(input.courseCode).catch(() => undefined)
      return 'unmatched'
    }
    const quiet = shouldReplaceQuietly(await io.getPresented().catch(() => [] as DeliveredLike[]), slotId, io.clock())
    const identifier = quiet ? slotId : openIdentifier(key)
    try {
      await io.present({
        identifier,
        ...content,
        data: quiet ? { tag: ATTENDANCE_OPEN_TAG, slotId, quiet: true } : { tag: ATTENDANCE_OPEN_TAG, slotId },
        sound: !quiet,
      })
    } catch {
      return 'present-failed'
    }
    // d. 提示を確かめてから。確かめられなければ何も取り消さない（開始アラームは残る＝鳴る側）。
    if (!(await confirmPresented(io, identifier))) return 'unconfirmed'
    // b だけ、まだ鳴っていない X の保留を取り消す（a の X は鳴り終わっているので保留に無い）。失敗は握りつぶして記録へ進む。
    if (!quiet) await io.cancelScheduled(slotId).catch(() => undefined)
    await io.recordAnnounced(slotId).catch(() => undefined)
    return quiet ? 'quiet-replaced' : 'announced'
  })
}

export type AttendedRetractionIO = {
  enqueue: <T>(task: () => Promise<T>) => Promise<T>
  todayNotices: () => Promise<AttendanceNotice[]>
  markRetracted: (date: string, ids: string[]) => void
  cancelScheduled: (identifier: string) => Promise<void>
  dismissPresented: (identifiers: string[]) => Promise<void>
}

/**
 * 出席済みのコマの開始・終了前を取り下げる（§4.4）。出席の直列キューの中で、M2 で当たった枠を
 * 当日の集合に入れてから、保留中の予約とトレイの配信済みの両方から消す。当たらなければ何もしない（終了前は鳴る側）。
 */
export async function runAttendedRetraction(
  io: AttendedRetractionIO,
  input: { rec: AttendedRecord | null; now: Date },
): Promise<string[]> {
  return io.enqueue(async () => {
    const today = todayKey(input.now)
    const ids = matchAttendedSlots(await io.todayNotices(), input.rec, today)
    if (ids.length === 0) return []
    io.markRetracted(today, ids)
    for (const id of ids) await io.cancelScheduled(id).catch(() => undefined)
    await io.dismissPresented(ids).catch(() => undefined)
    return ids
  })
}
