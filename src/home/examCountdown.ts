/**
 * ホーム「試験カウントダウン」の純関数。手動登録の試験イベント（小テスト/中間/期末）のうち
 * **表示開始を過ぎたもの**を、近い順に最大 limit 件返す。端末非依存・now注入で決定論的（Math.random/Date.now 非依存＝vitestで検証可能）。
 *
 * 設計: docs/2026-07-24-exam-countdown-card-spec.md（2026-07-24のユーザー裁定で**試験のみ**へ変更。
 * 課題の締切は従来どおり「直近の締切」セクション(homeDeadlines)が担い、ここには混ぜない）。
 * 表示開始: docs/design/2026-09-12-v11-train1-A.md（全体の設定と試験ごとの countdownStart。判定はこのファイルの中だけで行う）。
 * 日数は**暦日差**で数える。ミリ秒差だと「残り1日」が23:59に「残り0日」へ飛んで違和感が出るため。
 */
import type { ClassEvent, ClassEventType } from '../timetableEvents/classEvent'
import { eventTypeLabel, shortDate } from '../timetableEvents/eventLabels'
import { isValidHm } from '../timetableEvents/eventDateValue'
import type { UrgencyTone } from '../assignments/deadline'
import type { CampusPeriodTimes } from '../parsers/timetable'
import type { ExamCountdownStartSetting } from '../storage/displaySettingsSerialize'

export type ExamCountdownItem = {
  /**
   * タップ着地に必要な最小情報。着地先は courseCode があれば科目詳細、
   * 無い手動イベントのみ該当イベントの編集画面（HomeScreen の openCountdown）。
   */
  eventId: string
  courseName: string
  courseCode: string | null
  /** 主表示＝科目名。 */
  title: string
  /** 種別ラベル（小テスト/中間/期末）。 */
  typeLabel: string
  /** 補助行（時限・教室）。どちらも無ければ null。 */
  subtitle: string | null
  /** カウントダウンの基準日（その日の0:00）。並び替えの基準。 */
  targetDate: Date
  /** now からの暦日差（本日=0）。 */
  days: number
  /** '本日' / '明日' / '残りN日'。 */
  daysLabel: string
  /** 'M/D'。 */
  dateLabel: string
  /** 意味色ロール（red=本日・amber=3日以内・gray=それ以遠＝無彩色）。 */
  tone: UrgencyTone
}

/** カウントダウン対象の試験種別（掲示由来の休講/補講/教室変更・手動 other は対象外）。 */
const EXAM_TYPES: readonly ClassEventType[] = ['quiz', 'midterm', 'final']

/** 'YYYY-MM-DD' をローカル0:00のDateへ。書式不正・存在しない日付は null。 */
function parseYmd(ymd: string): Date | null {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(y, mo - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null
  return date
}

/** 暦日差（時刻を落として日付境界で数える）。DSTの影響を受けないようUTCの日付値で引く。 */
export function calendarDayDiff(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((b - a) / 86400000)
}

/** 暦日差の見出し。 */
export function countdownDaysLabel(days: number): string {
  if (days <= 0) return '本日'
  if (days === 1) return '明日'
  return `残り${days}日`
}

/** 意味色ロール。「色が付いている＝異常」の規約に従い、4日以上先は無彩色(gray)。 */
export function countdownTone(days: number): UrgencyTone {
  if (days <= 0) return 'red'
  if (days <= 3) return 'amber'
  return 'gray'
}

/** 補助行「3・4限 ・ K101」（時限・教室が無ければ省き、両方無ければ null）。 */
function examSubtitle(e: ClassEvent): string | null {
  const parts: string[] = []
  if (e.periods.length > 0) parts.push(`${e.periods.join('・')}限`)
  if (e.room) parts.push(e.room)
  return parts.length > 0 ? parts.join(' ・ ') : null
}

function hhmmToMin(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * 試験の時限のうち**最も遅い終了時刻**（0:00からの分）。当日の終了判定に使う。
 * 時限が空・periodTimes が無い・**1つでも引けない時限がある**場合は null＝日付のみの判定へ落とす
 * （引ける分だけで判定すると、引けなかった後半のコマが残っているのに早く消えてしまう）。
 */
export function latestPeriodEndMin(periods: number[], periodTimes: CampusPeriodTimes | null): number | null {
  if (!periodTimes || periods.length === 0) return null
  let latest = -1
  for (const p of periods) {
    const pt = periodTimes.periods.find((x) => x.period === p)
    if (!pt) return null
    const end = hhmmToMin(pt.end)
    if (end === null) return null
    if (end > latest) latest = end
  }
  return latest >= 0 ? latest : null
}

/**
 * 表示開始を過ぎているか（設計 A §4-2）。上から順に、最初に当てはまったもので決める:
 * 1. 試験ごとの「日時を指定」（開始日が実在し試験日以下・時刻が正しい）→ now ≥ ローカル(開始日, 時刻)
 * 2. 試験ごとの「N日前から」→ days ≤ N
 * 3. それ以外（指定なし／試験日より後などの壊れた「日時を指定」）→ 全体の設定。'always' は常に開始済み
 * days は暦日差なので「days ≤ N」＝「試験日の N 日前のローカル0:00以降」。
 */
function hasStarted(
  e: ClassEvent,
  targetDate: Date,
  days: number,
  now: Date,
  startSetting: ExamCountdownStartSetting,
): boolean {
  const cs = e.countdownStart
  if (cs?.kind === 'at') {
    const startDay = parseYmd(cs.date)
    if (startDay && isValidHm(cs.time) && calendarDayDiff(startDay, targetDate) >= 0) {
      const [h, m] = cs.time.split(':').map(Number)
      const start = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate(), h, m)
      return now.getTime() >= start.getTime()
    }
  } else if (cs?.kind === 'days') {
    return days <= cs.days
  }
  return startSetting === 'always' || days <= startSetting
}

function examItem(
  e: ClassEvent,
  now: Date,
  periodTimes: CampusPeriodTimes | null,
  startSetting: ExamCountdownStartSetting,
): ExamCountdownItem | null {
  if (!EXAM_TYPES.includes(e.type)) return null
  const targetDate = parseYmd(e.date)
  if (!targetDate) return null
  const days = calendarDayDiff(now, targetDate)
  if (days < 0) return null
  if (days === 0) {
    // 当日は時限の終了で消す。時限が引けない試験は従来どおり日付のみ＝当日いっぱい残す（安全側）。
    const endMin = latestPeriodEndMin(e.periods, periodTimes)
    if (endMin !== null && now.getHours() * 60 + now.getMinutes() > endMin) return null
  }
  // 表示開始前は、並べて limit 件に切る**前に**落とす（切ってから落とすとカードの件数が減る＝設計 A §6 Q2）。
  if (!hasStarted(e, targetDate, days, now, startSetting)) return null
  return {
    eventId: e.id,
    courseName: e.courseName,
    courseCode: e.courseCode,
    title: e.courseName,
    typeLabel: eventTypeLabel(e.type),
    subtitle: examSubtitle(e),
    targetDate,
    days,
    daysLabel: countdownDaysLabel(days),
    dateLabel: shortDate(e.date),
    tone: countdownTone(days),
  }
}

/** 同日は科目名順（決定論的に並べる）。 */
function byTargetAsc(a: ExamCountdownItem, b: ExamCountdownItem): number {
  const d = a.targetDate.getTime() - b.targetDate.getTime()
  return d !== 0 ? d : a.title.localeCompare(b.title, 'ja')
}

/**
 * 手動登録の試験（小テスト/中間/期末）のうち表示開始を過ぎたものを、近い順に最大 limit 件返す。
 * 空配列＝表示対象なし（UI側はセクションごと描画しない）。
 *
 * periodTimes を渡すと、当日の試験は**その時限の終了時刻を過ぎた時点で**カードから外す
 * （終わった試験のカウントダウンが夜まで「本日」と出続けるのを防ぐ）。省略・null なら
 * 従来どおり日付のみの判定＝当日は終日残る。
 *
 * startSetting は全体の表示開始（設定＞表示）。省略時は 'always'＝従来どおり日付に関係なく出す。
 * 試験ごとの countdownStart があればそちらが勝つ（hasStarted）。表示開始前の試験は並べて切る前に落とすので、
 * 上位 limit 件は開始済みの試験の中から選ばれる。
 */
export function buildExamCountdown(
  events: ClassEvent[],
  now: Date,
  limit = 3,
  periodTimes: CampusPeriodTimes | null = null,
  startSetting: ExamCountdownStartSetting = 'always',
): ExamCountdownItem[] {
  if (limit <= 0) return []
  return events
    .map((e) => examItem(e, now, periodTimes, startSetting))
    .filter((i): i is ExamCountdownItem => i !== null)
    .sort(byTargetAsc)
    .slice(0, limit)
}
