/**
 * 時間割（収集済み）と時限時刻から出席アラームの発火時刻を計算する純粋関数。
 * 二層アラームの「層1（時間割ベースの多点ナッジ）」用。授業開始と終了◯分前の2点を出す。
 * expo-notifications への予約は notifier.ts が本結果を使う（本モジュールは端末非依存・now注入で決定論的）。
 * 仕様: docs/superpowers/specs/2026-07-05-v2.0.0-class-integration-design.md「出席アラーム設計」。
 */
import type { DayOfWeek } from '../parsers/timetable'
import type { Quarter } from '../parsers/timetable'
import type { TimetableOverrides } from '../timetableEvents/quarter'
import type { TimetableCollection } from '../collect/timetableMessage'
import { isCourseActiveOn, type CourseTermInfo } from '../attendance/courseOver'

export type AttendanceAlarmKind = 'attendance-start' | 'attendance-last-chance'

export type AttendanceAlarm = {
  kind: AttendanceAlarmKind
  courseCode: string
  courseName: string
  day: DayOfWeek
  period: number
  fireAt: string
  /**
   * その授業回の終了時刻（'HH:MM'・連続コマなら塊の末尾）。ラストチャンスの文面が
   * 「あとどれだけ猶予があるか」を言うために持つ。開始アラームでは使わないので省略可。
   *
   * **相対の残り分数ではなく絶対時刻を持つ理由**: Android 12+ では SCHEDULE_EXACT_ALARM を
   * 宣言しない方針のため予約は setAndAllowWhileIdle（不正確）で、実発火が数分ずれうる。
   * 「残り10分」は遅延ぶんだけ嘘になるが、終了時刻はいつ発火しても真のまま。
   */
  endsAt?: string
}

/** courseCode -> 有効。キー不在は「有効」とみなす（既定ON）。false のみ無効。 */
export type AttendanceAlarmSettings = Record<string, boolean>

export type AttendanceAlarmOptions = {
  /** 何日先まで予約するか。既定7日。 */
  daysAhead?: number
  /** ラストチャンス通知を授業終了の何分前に出すか。既定10分。 */
  lastChanceLeadMinutes?: number
}

/** 終了前の通知を授業終了の何分前に出すかの既定。N1 の照合（まとめ・M2）と共有する（設計 §4.3）。 */
export const DEFAULT_LAST_CHANCE_LEAD_MINUTES = 10

/**
 * 休講が登録されているコマ（アラームを出さない対象）。ClassEvent から必要な分だけ写した形。
 *
 * これが無かった頃は、休講を登録しても**同じ日に「◯◯ 休講」と「◯◯ 出席コード」が両方届いていた**
 * （当日8:00に休講通知 → 授業開始時刻と終了10分前に出席アラーム2通・後者はMAXチャンネル）。
 * ホーム画面は同じ日に「休講」タグを出しており、UI表示と通知が食い違っていた（2026-07-17修正）。
 */
export type CancelledClass = {
  /** 'YYYY-MM-DD'。 */
  date: string
  /** 休講の時限。連続コマの一部だけ休講もありうるので配列で持つ。 */
  periods: number[]
  /** 掲示由来のイベントは courseCode を引けないことがある（その場合は名前で照合する）。 */
  courseCode: string | null
  courseName: string
}

const p2 = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`

/**
 * その日・その科目・その時限が休講か。
 * **科目で必ず絞る**（日付と時限だけで判定すると同じ時限の別科目まで巻き込んで通知を消す）。
 * courseCode があればそれで、無ければ科目名で照合する。どちらでも引けなければ false
 * ＝**アラームを出す側に倒す**（休講の判定を外して通知を殺すより、余分に鳴るほうが安全）。
 */
function isCancelled(
  cancelled: CancelledClass[],
  dateKey: string,
  courseCode: string,
  courseName: string,
  period: number,
): boolean {
  return cancelled.some(
    (c) =>
      c.date === dateKey &&
      c.periods.includes(period) &&
      (c.courseCode ? c.courseCode === courseCode : c.courseName === courseName),
  )
}

const WEEKDAY: Record<DayOfWeek, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }

function atLocalTime(base: Date, hhmm: string): Date | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), Number(m[1]), Number(m[2]), 0, 0)
}

/**
 * 昇順の時限番号を「連続する塊」へ分ける（[4,5,7] -> [[4,5],[7]]）。
 * CLASSの時間割は**連続コマを時限ごとの別セルで返す**ため、素直にslot単位でアラームを作ると
 * 1回の授業（例: 物理学実験Ａ 火4-5限＝14:40〜17:50）に開始/終了前が2組＝**4通**届く。
 * しかも16:00「まだなら今のうちに」と16:20「入力できるか確認しましょう」が実験の最中に20分間隔で
 * 鳴る（どちらもMAXチャンネル＝音＋ヘッドアップ）。塊にまとめて開始1通・終了前1通にする。
 */
export function consecutiveRuns(periods: number[]): number[][] {
  const sorted = [...new Set(periods)].sort((a, b) => a - b)
  const runs: number[][] = []
  for (const p of sorted) {
    const last = runs[runs.length - 1]
    if (last && p === last[last.length - 1] + 1) last.push(p)
    else runs.push([p])
  }
  return runs
}

export function computeAttendanceAlarms(
  collections: TimetableCollection[],
  settings: AttendanceAlarmSettings,
  now: Date,
  options: AttendanceAlarmOptions = {},
  /** 休講登録済みのコマ。渡さなければ従来どおり全コマにアラームを出す。 */
  cancelled: CancelledClass[] = [],
  /**
   * 学期の授業回が終わった科目を落とすための情報。渡さなければ従来どおり全コマに出す。
   *
   * 時間割は学期が終わってもコマを持ち続けるので、この情報が無いと前期終了後も毎週鳴る
   * （2026-08-03のユーザー報告）。判定は画面と同じ isCourseActiveOn を通す＝
   * **述語をここで再実装しない**。2箇所に持つと必ずズレる。
   */
  termInfo: CourseTermInfo = { termEnds: {}, nameOwners: {}, extraPlans: [], calendar: null },
): AttendanceAlarm[] {
  const daysAhead = options.daysAhead ?? 7
  const lead = options.lastChanceLeadMinutes ?? DEFAULT_LAST_CHANCE_LEAD_MINUTES
  const alarms: AttendanceAlarm[] = []

  for (let i = 0; i < daysAhead; i++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 0, 0, 0, 0)
    const weekday = date.getDay()
    const dateKey = ymd(date)

    for (const col of collections) {
      const periods = col.periodTimes?.periods ?? []
      // その曜日の「科目 × 時限」を集める。**同日・同一科目の連続コマは1セッション**として扱うため、
      // slot単位ではなく科目単位でいったん束ねる。曜日でまず絞るので、別の曜日にある同じ科目
      // （例: 基礎電気数学及び演習が月1と金3）は別授業回として当然に分かれる。
      const byCourse = new Map<string, { name: string; day: DayOfWeek; periods: number[] }>()
      for (const slot of col.slots) {
        if (WEEKDAY[slot.day] !== weekday) continue
        // 時限時刻が無い時限は開始/終了を出せないので、束ねる前に落とす
        // （落とさないと [4,5] の5だけ時刻不明のとき塊の終端が壊れる）。
        if (!periods.some((p) => p.period === slot.period)) continue
        for (const c of slot.classes) {
          if (settings[c.courseCode] === false) continue
          const cur = byCourse.get(c.courseCode)
          if (cur) cur.periods.push(slot.period)
          else byCourse.set(c.courseCode, { name: c.name, day: slot.day, periods: [slot.period] })
        }
      }

      for (const [courseCode, e] of byCourse) {
        // 学期の授業回が終わった科目はここで丸ごと落とす。最終授業日が分からなければ通す
        // （出欠が未収集の端末で全アラームが消えるのを防ぐ）。学期終了後でもその日に
        // 期末・補講の予定があれば isCourseActiveOn 側が true を返すので落ちない。
        if (
          !isCourseActiveOn({
            courseCode,
            courseName: e.name,
            dateKey,
            termEnds: termInfo.termEnds,
            nameOwners: termInfo.nameOwners,
            calendar: termInfo.calendar,
            extraPlans: termInfo.extraPlans,
          })
        ) {
          continue
        }
        // 休講のコマを落としてから塊にする。連続コマの一部だけ休講なら、残りのコマで塊を組み直す
        // （例: 4-5限のうち5限だけ休講 → 4限だけの授業として開始/終了前を出す）。
        const active = e.periods.filter((p) => !isCancelled(cancelled, dateKey, courseCode, e.name, p))
        for (const run of consecutiveRuns(active)) {
          const firstPt = periods.find((p) => p.period === run[0])
          const lastPt = periods.find((p) => p.period === run[run.length - 1])
          if (!firstPt || !lastPt) continue
          // 塊の先頭の開始〜末尾の終了が「その授業1回」の実時間帯。
          const start = atLocalTime(date, firstPt.start)
          const end = atLocalTime(date, lastPt.end)
          if (start && start.getTime() > now.getTime()) {
            alarms.push({
              kind: 'attendance-start',
              courseCode,
              courseName: e.name,
              day: e.day,
              period: run[0],
              fireAt: start.toISOString(),
            })
          }
          if (end) {
            const lc = new Date(end.getTime() - lead * 60 * 1000)
            if (lc.getTime() > now.getTime()) {
              alarms.push({
                kind: 'attendance-last-chance',
                courseCode,
                courseName: e.name,
                day: e.day,
                period: run[0],
                fireAt: lc.toISOString(),
                // 塊の末尾の終了時刻＝その授業回が実際に終わる時刻。
                endsAt: lastPt.end,
              })
            }
          }
        }
      }
    }
  }

  alarms.sort((a, b) => new Date(a.fireAt).getTime() - new Date(b.fireAt).getTime())
  return alarms
}

/**
 * 出席アラームの表示文面。
 *
 * **狭い画面（スマートウォッチ）を基準に組む。** Wear OS / watchOS はペアリングしたスマホの通知を
 * 既定でミラーするので、この文面はそのまま手首に出る。手首では題名＋本文の数行しか読めないため:
 *
 * - 題名は**科目名を先頭に置く**。切り詰められても「どの授業か」だけは残る（出席は科目が分からないと動けない）。
 * - 本文で科目名を繰り返さない。題名に既にあるので、繰り返すと狭い1行を同じ情報で潰す。
 * - 本文は**段階ごとに先頭の語を変える**。題名は2通とも同一なので、先頭が同じだと
 *   開始アラームとラストチャンスが手首で見分けられない。
 * - ラストチャンスは終了の**絶対時刻**を言う（相対の残り分数にしない理由は AttendanceAlarm.endsAt）。
 */
export function buildAttendanceNotificationContent<A extends Pick<AttendanceAlarm, 'kind' | 'courseName' | 'endsAt'>>(
  alarm: A,
): { title: string; body: string } {
  const title = `${alarm.courseName} 出席コード`
  if (alarm.kind === 'attendance-start') {
    return { title, body: '授業が始まりました。出席コードを入力できるか確認しましょう' }
  }
  // endsAt が引けないとき（時限時刻の欠落）は時刻を騙らず、猶予の話だけにする。
  const body = alarm.endsAt
    ? `授業は${alarm.endsAt}まで。出席がまだなら今のうちに入力しましょう`
    : 'まもなく授業が終わります。出席がまだなら今のうちに入力しましょう'
  return { title, body }
}

// ---- N1（v1.1 train1・2026-09-12）: 同じ種類・同じ時刻の出席アラームを1通にまとめる ----
// 設計: docs/design/2026-09-12-v11-train1-N1.md §4.1・§4.2。
// 🔴 まとめるだけで消さない（representativeClass を持ち込まない＝禁止事項1）。鳴る時刻の集合は変えない（§7-T1）。

/** 予約する出席通知の1枠（同じ種類・同じずらす前の時刻の出席アラームをまとめたもの）。 */
export type AttendanceNotice = {
  /** `att:s:YYYYMMDD-HHMM`（開始）／`att:l:YYYYMMDD-HHMM`（終了前）。ずらす前の時刻のローカル時刻。 */
  id: string
  kind: AttendanceAlarmKind
  /** ずらす前の時刻（ISO）。staggerSameInstant を通した後は実際に予約する時刻になる（id は変わらない）。 */
  fireAt: string
  /** 終了前のみ（同じ時刻にまとまる科目は終了時刻も同じ）。 */
  endsAt?: string
  /** 'YYYY-MM-DD'（ローカル）。 */
  date: string
  /** 'HH:MM-HH:MM'＝まとめた科目の授業時間の和（照合 M1・M2 に使う）。 */
  span: string
  /** 1件以上・科目コードの重複なし・科目コードの昇順。 */
  courses: { courseCode: string; courseName: string }[]
}

const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes()
const hhmmFromMinutes = (m: number) => `${p2(Math.floor(m / 60))}:${p2(m % 60)}`
function minutesOfHhmm(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}
const byCourseCode = (a: { courseCode: string }, b: { courseCode: string }) =>
  a.courseCode < b.courseCode ? -1 : a.courseCode > b.courseCode ? 1 : 0

/**
 * 出席の予約の identifier（§4.2）。入力が同じなら貼り直しをまたいでも同じ値になり、積みコマは同じ時刻なので同じ枠になる。
 * 🔴 時限番号を鍵にしない（禁止事項6）: 先頭の時限が同じで終わりが違う積みコマ（A＝3-4限・B＝3限）で、
 * 2つの終了前が同じ鍵になり、片方が上書きされて黙って消える。
 */
export function attendanceNoticeId(kind: AttendanceAlarmKind, fireAtIso: string): string {
  const d = new Date(fireAtIso)
  const k = kind === 'attendance-start' ? 's' : 'l'
  return `att:${k}:${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`
}

const NOTICE_ID = /^att:[sl]:\d{8}-\d{4}$/

/** 決まった形の出席 identifier か（計器の legacy＝旧版の uuid を数えるのに使う）。 */
export function isAttendanceNoticeId(id: string): boolean {
  return NOTICE_ID.test(id)
}

/** 開始の枠の identifier か（受付open 済みの除外 M4 は開始だけ）。 */
export function isStartNoticeId(id: string): boolean {
  return NOTICE_ID.test(id) && id.startsWith('att:s:')
}

/** その日のローカル 0:00。 */
export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

/** span（'HH:MM-HH:MM'）を分に直す。読めなければ null。 */
export function spanMinutes(span: string): { startMin: number; endMin: number } | null {
  const m = span.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/)
  if (!m) return null
  const startMin = minutesOfHhmm(m[1])
  const endMin = minutesOfHhmm(m[2])
  return startMin === null || endMin === null ? null : { startMin, endMin }
}

/**
 * 出席アラームを「種類＋ずらす前の発火時刻（＝identifier）」ごとに1枠へまとめる（純粋・入力を壊さない）。
 * 科目ごとの計算（科目別OFF・休講・学期終了）は computeAttendanceAlarms がもう済ませているので、ここは束ねるだけ。
 * span（授業の時間帯）は、同じ授業回（科目×日付×先頭の時限）の開始と終了前の組から起こす。開始が既に過ぎていると
 * 組が欠けるので、呼び出し側は今日の0:00から計算した出力を渡す（upcomingAttendanceNotices）。
 */
export function mergeAttendanceNotices(alarms: readonly AttendanceAlarm[]): AttendanceNotice[] {
  const runKey = (a: AttendanceAlarm) => `${a.courseCode}|${ymd(new Date(a.fireAt))}|${a.period}`
  const runs = new Map<string, { startMin?: number; endMin?: number }>()
  for (const a of alarms) {
    const r = runs.get(runKey(a)) ?? {}
    if (a.kind === 'attendance-start') {
      r.startMin = minutesOfDay(new Date(a.fireAt))
    } else {
      const fallback = minutesOfDay(new Date(new Date(a.fireAt).getTime() + DEFAULT_LAST_CHANCE_LEAD_MINUTES * 60_000))
      r.endMin = (a.endsAt ? minutesOfHhmm(a.endsAt) : null) ?? fallback
    }
    runs.set(runKey(a), r)
  }

  type Group = {
    kind: AttendanceAlarmKind
    fireAt: string
    endsAt?: string
    date: string
    startMin: number
    endMin: number
    courses: Map<string, string>
  }
  const groups = new Map<string, Group>()
  for (const a of alarms) {
    const id = attendanceNoticeId(a.kind, a.fireAt)
    const r = runs.get(runKey(a)) ?? {}
    const own = minutesOfDay(new Date(a.fireAt))
    const s = r.startMin ?? r.endMin ?? own
    const e = r.endMin ?? r.startMin ?? own
    const g = groups.get(id)
    if (g) {
      g.startMin = Math.min(g.startMin, s)
      g.endMin = Math.max(g.endMin, e)
      if (!g.courses.has(a.courseCode)) g.courses.set(a.courseCode, a.courseName)
      if (!g.endsAt && a.endsAt) g.endsAt = a.endsAt
    } else {
      groups.set(id, {
        kind: a.kind,
        fireAt: a.fireAt,
        endsAt: a.endsAt,
        date: ymd(new Date(a.fireAt)),
        startMin: s,
        endMin: e,
        courses: new Map([[a.courseCode, a.courseName]]),
      })
    }
  }

  return [...groups.entries()]
    .map(([id, g]): AttendanceNotice => ({
      id,
      kind: g.kind,
      fireAt: g.fireAt,
      ...(g.endsAt ? { endsAt: g.endsAt } : {}),
      date: g.date,
      span: `${hhmmFromMinutes(g.startMin)}-${hhmmFromMinutes(g.endMin)}`,
      courses: [...g.courses].map(([courseCode, courseName]) => ({ courseCode, courseName })).sort(byCourseCode),
    }))
    .sort(
      (x, y) =>
        new Date(x.fireAt).getTime() - new Date(y.fireAt).getTime() || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0),
    )
}

/**
 * 予約する出席通知（まとめた後）のうち、now より後に鳴るもの。
 * 🔴 alarmsFromDayStart は **今日の0:00から** 計算した computeAttendanceAlarms の出力を渡すこと。
 * 始まっている授業の終了前にも span が付き、鳴る時刻の集合は now で計算した場合と同じになる（§7-T1 で固定）。
 */
export function upcomingAttendanceNotices(alarmsFromDayStart: readonly AttendanceAlarm[], now: Date): AttendanceNotice[] {
  return mergeAttendanceNotices(alarmsFromDayStart).filter((n) => new Date(n.fireAt).getTime() > now.getTime())
}

/** id が excludedIds に入る枠を落とす（除外 M4・M5。§4.3）。 */
export function excludeNotices(notices: readonly AttendanceNotice[], excludedIds: ReadonlySet<string>): AttendanceNotice[] {
  return notices.filter((n) => !excludedIds.has(n.id))
}

/**
 * 今日の枠（照合 M1・M2 用・§4.3）。**科目別OFF・休講・学期終了を通さない**＝時間割にある全科目。
 * 既存の computeAttendanceAlarms をそのまま使い、コマの組み方を再実装しない。
 */
export function todaySlotNotices(collections: TimetableCollection[], now: Date): AttendanceNotice[] {
  return mergeAttendanceNotices(computeAttendanceAlarms(collections, {}, startOfLocalDay(now), { daysAhead: 1 }))
}

/** 積みコマの題名を決める材料（§4.1）。 */
export type NoticeTitleContext = {
  /** timetable.overrides.v1（科目ごとの半期の明示）。CLASS は半期を返さないので、指定はここにしか無い。 */
  overrides: TimetableOverrides
  /** 現在の半期の**手動**指定（loadCurrentQuarter）。null＝自動（月の近似）＝題名の絞り込みに使わない。 */
  manualQuarter: Quarter | null
  /** 並べ替えに使う現在の半期（resolveCurrentQuarter の値）。変わるのは順番だけ。 */
  resolvedQuarter: Quarter
}

/**
 * まとめた枠の題名に使う科目名（§4.1・§9-2 承認）。**絞るのは題名だけで、枠（鳴る時刻）はどの場合も1つ残る。**
 * 1つの名前にするのは、①現在の半期が手動で指定され②全科目に半期が明示され③現在の半期に一致するのがちょうど1科目、の時だけ。
 * それ以外は全科目を「／」で並べる（現在の半期に一致と明示 → 未指定 → 別の半期と明示、同順位は科目コード昇順）。
 * 古い指定のまま忘れていても（9月に「前半」、12月もそのまま）害は科目名の取り違えで、出席を落とす方向ではない。
 */
export function noticeTitleName(
  courses: readonly { courseCode: string; courseName: string }[],
  ctx: NoticeTitleContext,
): string {
  const names = [...new Set(courses.map((c) => c.courseName))]
  if (names.length <= 1) return names[0] ?? ''
  const quarterOf = (c: { courseCode: string }) => ctx.overrides[c.courseCode]?.quarter
  if (ctx.manualQuarter !== null && courses.every((c) => quarterOf(c) !== undefined)) {
    const hits = courses.filter((c) => quarterOf(c) === ctx.manualQuarter)
    if (hits.length === 1) return hits[0].courseName
  }
  const rank = (c: { courseCode: string }) => {
    const q = quarterOf(c)
    return q === ctx.resolvedQuarter ? 0 : q === undefined ? 1 : 2
  }
  const ordered = [...courses].sort((a, b) => rank(a) - rank(b) || byCourseCode(a, b))
  return [...new Set(ordered.map((c) => c.courseName))].join('／')
}

/**
 * まとめた枠の文面。1科目でも複数科目でも既存の buildAttendanceNotificationContent に任せる
 * （題名の科目名だけを差し替える）＝今の文面の回帰は構造上起きない（§4.1）。
 */
export function buildAttendanceNoticeContent(
  notice: AttendanceNotice,
  ctx: NoticeTitleContext,
): { title: string; body: string } {
  return buildAttendanceNotificationContent({
    kind: notice.kind,
    courseName: noticeTitleName(notice.courses, ctx),
    endsAt: notice.endsAt,
  })
}
