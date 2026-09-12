/**
 * 出席受付openローカル通知の純粋ロジック（RN非依存・テスト可能）。
 * dedupキー生成・発火可否判定・文面・当日外キー剪定に加え、N1（2026-09-12）で
 * 登録（claim）・コマの照合（M1・M2）・音なしの判断・除外の集合（M4・M5）を担う。
 * 端末I/O（即時提示/dismiss）は notifier.ts、永続化は notifiedAttendanceOpenStore.ts・announcedSlotsStore.ts、
 * 順番は attendanceOpenSequence.ts、配線は attendanceOpenFlow.ts（呼び出し元は AttendanceEngineProvider.tsx）。
 * 設計: docs/superpowers/specs/2026-07-12-attendance-open-local-notification-design.md（初版）・
 *       docs/design/2026-09-12-v11-train1-N1.md（N1）
 *
 * 即時発火型（trigger に channelId のみ）。🔴 2026-09-12 撤回（N1 §4.8-撤回2）: 以前は
 * 「refreshAllNotifications とは完全に独立した経路——混ぜない」だったが、独立のままだと
 * 授業開始の予約アラームと受付open が別々に MAX チャンネルで鳴る（二重）。今は出席の直列キューで予約と協調させる。
 */
import type { AttendanceStatus } from '../collect/attendanceMessage'
import { todayKey } from '../attendance/attendedState'
import { ATTENDANCE_TAG } from './notificationTags'
import { isStartNoticeId, spanMinutes, type AttendanceNotice } from './attendanceSchedule'
import { ACTIVE_CLASS_PRE_MINUTES } from '../attendance/classPeriod'
import { parseWindowMinutes } from '../attendance/receptionWindow'
import type { AttendedRecord } from '../attendance/attendedState'

/**
 * 当日キー＋科目名＋受付時間から dedup キーを作る。
 * 受付が同日2回開かれ confirmWindow が異なれば別キー＝再通知される（再受付ケースに対応）。
 */
export function attendanceOpenKey(input: {
  courseName: string | null
  confirmWindow: string | null
  now: Date
}): string {
  return `${todayKey(input.now)}|${input.courseName ?? '?'}|${input.confirmWindow ?? '?'}`
}

/**
 * 発火可否の純粋判定。真の条件:
 *   - status === 'accepting'
 *   - attendedNow === false（既に出席済みは通知しない）
 *   - attendanceFocused === false（出席画面を見ている最中はバナーで足りるため抑制）
 *   - notifiedKeys に当該キーを含まない（同一授業/受付ウィンドウで1回に制限）
 *   - courseDisabled === false（設定画面で科目別にOFFにしていない）
 */
export function shouldNotifyAttendanceOpen(input: {
  status: AttendanceStatus
  attendedNow: boolean
  attendanceFocused: boolean
  key: string
  notifiedKeys: string[]
  /**
   * 設定画面「出席アラーム（科目別）」でこの科目がOFFか。
   * これが無かった頃は科目別OFFが**予約型アラームにしか効かず**、OFFにした科目の受付open通知が
   * MAXチャンネル（音＋ヘッドアップ）で届いていた＝アプリ内に止める手段が無かった（2026-07-17修正）。
   * 解決できないときは false（＝通知する）に倒すこと。黙って通知を殺すより鳴るほうが安全。
   */
  courseDisabled?: boolean
}): boolean {
  if (input.status !== 'accepting') return false
  if (input.attendedNow) return false
  if (input.attendanceFocused) return false
  if (input.courseDisabled === true) return false
  if (input.notifiedKeys.includes(input.key)) return false
  return true
}

/**
 * 時間割から科目名で courseCode を引く（純粋）。受付open通知は科目名しか持たない一方、
 * 設定は courseCode 鍵なので橋渡しが要る。
 *
 * **完全一致のみ・引けなければ null**。null は呼び出し側で「OFFか分からない＝通知する」に倒す。
 * 表記ゆれや補講（時間割に無い）で引けなくても、失敗の向きが「余分に鳴る」側なので出席を落とさない。
 */
export function courseCodeByName(
  collections: { slots: { classes: { courseCode: string; name: string }[] }[] }[],
  name: string | null,
): string | null {
  if (!name) return null
  for (const col of collections) {
    for (const slot of col.slots) {
      for (const c of slot.classes) {
        if (c.name === name) return c.courseCode
      }
    }
  }
  return null
}

/**
 * 通知文面。タイトルは定型、本文は科目名＋受付時刻範囲（null フォールバックあり）。
 */
export function buildAttendanceOpenContent(reception: {
  courseName: string | null
  confirmWindow: string | null
}): { title: string; body: string } {
  const title = '出席受付が始まりました'
  const win = reception.confirmWindow ? `（${reception.confirmWindow}）` : ''
  const body = reception.courseName
    ? `「${reception.courseName}」の出席受付中${win}。タップして出席登録`
    : `出席受付が開いています${win}。タップして出席登録`
  return { title, body }
}

/** 当日（today）以外のキーを削除する（保存時に呼び、日跨ぎの残留を防ぐ）。 */
export function pruneNotifiedAttendanceKeys(keys: string[], today: string): string[] {
  const prefix = `${today}|`
  return keys.filter((k) => k.startsWith(prefix))
}

// ---- N1（v1.1 train1・2026-09-12）: 受付open・出席済みと予約の協調（設計 §4.3・§4.4） ----

/** 鳴り終わった開始アラームを音なしで置き換える窓（オーナー承認 2026-09-12・§9-1）。長くすると授業の途中で遅れて開いた受付まで音なしになる。 */
export const QUIET_MS = 3 * 60 * 1000

export type ClaimInput = {
  status: AttendanceStatus
  attendedNow: boolean
  attendanceFocused: boolean
  key: string
  courseDisabled?: boolean
  /** 'YYYY-MM-DD'（当日以外のキーを捨てる）。 */
  today: string
}

/**
 * 受付open を「自分が出す」と確定する（§4.3-1・H3）。mutateNotifiedAttendanceOpen の中で呼ぶ＝提示の前に登録する。
 * 以前は read → 提示 → write の順でアトミックでなく、30秒ポーリングと前面復帰の再注入が重なると両方がすり抜けた。
 */
export function claimAttendanceOpen(keys: readonly string[], input: ClaimInput): { next: string[]; claimed: boolean } {
  if (!shouldNotifyAttendanceOpen({ ...input, notifiedKeys: [...keys] })) return { next: [...keys], claimed: false }
  return { next: pruneNotifiedAttendanceKeys([...keys, input.key], input.today), claimed: true }
}

const minutesNow = (now: Date) => now.getHours() * 60 + now.getMinutes()

/**
 * M1 受付open → コマ（§4.3 の表）。今日の開始の枠のうち、①まとめた科目名のどれかが受付の科目名と完全一致し、
 * ②[span の開始−5分, span の終了] が今を含むもの。ちょうど1つならその identifier、0件・2件以上は null（コマ不明＝c）。
 * 科目コードでなく科目名で当てる理由: courseCodeByName は時間割で先に出た方のコードを返し、同名別コードの積みコマで受付の科目とは限らない。
 */
export function matchOpenSlot(
  todayNotices: readonly AttendanceNotice[],
  courseName: string | null,
  now: Date,
): string | null {
  if (!courseName) return null
  const today = todayKey(now)
  const t = minutesNow(now)
  const hits = todayNotices.filter((n) => {
    if (n.kind !== 'attendance-start' || n.date !== today) return false
    if (!n.courses.some((c) => c.courseName === courseName)) return false
    const s = spanMinutes(n.span)
    return !!s && t >= s.startMin - ACTIVE_CLASS_PRE_MINUTES && t <= s.endMin
  })
  return hits.length === 1 ? hits[0].id : null
}

/** 配信済み通知の写し（expo の Notification から identifier・date・data だけを取ったもの）。date は OS の単位のまま。 */
export type DeliveredLike = { identifier: string; date: number; data: Record<string, unknown> | null }

/** 配信時刻を ms に揃える。iOS は秒・Android はミリ秒で返す（N1 §3）。揃えないと3分判定が常に外れ、音が2回に戻る。 */
export function deliveredAtMs(date: number): number {
  return date < 1e11 ? date * 1000 : date
}

/**
 * a（音なしで置き換える）に当たるか（§4.3-a）。X の開始アラームが**配信済み**でトレイにあり、配信から QUIET_MS 以内。
 * X がまだ鳴っていない（トレイに無い）時は偽＝b（別の identifier）。iOS で保留中の X と同じ identifier を使うと、提示の前に X が消えるため。
 */
export function shouldReplaceQuietly(presented: readonly DeliveredLike[], slotId: string, nowMs: number): boolean {
  const x = presented.find(
    (n) => n.identifier === slotId && n.data?.tag === ATTENDANCE_TAG && n.data?.kind === 'attendance-start',
  )
  if (!x) return false
  return nowMs - deliveredAtMs(x.date) <= QUIET_MS
}

/**
 * M2 出席済み → コマ（§4.3 の表）。記録の日付が今日で、枠の科目名のどれかと完全一致し、
 * [span の開始−5分, span の終了] が受付時間の範囲と重なる枠。種類（開始・終了前）ごとにちょうど1つならそれ。
 * 受付時間が読めない記録では何もしない（今の時刻で代用すると、後の貼り直しで同じ日の別の回に当たる）。
 */
export function matchAttendedSlots(
  todayNotices: readonly AttendanceNotice[],
  rec: AttendedRecord | null,
  today: string,
): string[] {
  if (!rec || rec.date !== today) return []
  const w = parseWindowMinutes(rec.confirmWindow)
  if (!w) return []
  const ids: string[] = []
  for (const kind of ['attendance-start', 'attendance-last-chance'] as const) {
    const hits = todayNotices.filter((n) => {
      if (n.kind !== kind || n.date !== today) return false
      if (!n.courses.some((c) => c.courseName === rec.courseName)) return false
      const s = spanMinutes(n.span)
      return !!s && s.startMin - ACTIVE_CLASS_PRE_MINUTES <= w.endMin && w.startMin <= s.endMin
    })
    if (hits.length === 1) ids.push(hits[0].id)
  }
  return ids
}

const ymd8 = (today: string) => today.replace(/-/g, '')

/**
 * 貼り直しで予約しない枠の集合（§4.3 の M4・M5・§4.4）。
 * M4＝受付open 済み（当日の開始の枠だけ。終了前は除外しない）／M5＝出席済み（M2 で当たった開始・終了前）＋取り下げた当日の集合。
 */
export function collectExcludedIds(input: {
  announced: readonly string[]
  attendedRec: AttendedRecord | null
  retracted: readonly string[]
  todayNotices: readonly AttendanceNotice[]
  today: string
}): Set<string> {
  const day = ymd8(input.today)
  const announced = input.announced.filter((id) => isStartNoticeId(id) && id.slice(6, 14) === day)
  return new Set([
    ...announced,
    ...matchAttendedSlots(input.todayNotices, input.attendedRec, input.today),
    ...input.retracted,
  ])
}

/** 受付open 済みのコマの記録に1件足す（当日以外を捨て、同じ枠は重複させない）。`attendance.announcedSlots.v1` の中身。 */
export function addAnnouncedSlotId(ids: readonly string[], slotId: string, today: string): string[] {
  const day = ymd8(today)
  return [...ids.filter((id) => id.slice(6, 14) === day && id !== slotId), slotId]
}
