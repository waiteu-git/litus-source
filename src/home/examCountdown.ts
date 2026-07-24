/**
 * ホーム「試験カウントダウン」の純関数。手動登録の試験イベント（小テスト/中間/期末）を
 * 近い順に最大 limit 件返す。端末非依存・now注入で決定論的（Math.random/Date.now 非依存＝vitestで検証可能）。
 *
 * 設計: docs/2026-07-24-exam-countdown-card-spec.md（2026-07-24のユーザー裁定で**試験のみ**へ変更。
 * 課題の締切は従来どおり「直近の締切」セクション(homeDeadlines)が担い、ここには混ぜない）。
 * 日数は**暦日差**で数える。ミリ秒差だと「残り1日」が23:59に「残り0日」へ飛んで違和感が出るため。
 */
import type { ClassEvent, ClassEventType } from '../timetableEvents/classEvent'
import { eventTypeLabel, shortDate } from '../timetableEvents/eventLabels'
import type { UrgencyTone } from '../assignments/deadline'

export type ExamCountdownItem = {
  /** タップ着地（該当イベントの編集画面）に必要な最小情報。 */
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

function examItem(e: ClassEvent, now: Date): ExamCountdownItem | null {
  if (!EXAM_TYPES.includes(e.type)) return null
  const targetDate = parseYmd(e.date)
  if (!targetDate) return null
  const days = calendarDayDiff(now, targetDate)
  if (days < 0) return null // 当日は含む（試験は時刻を持たないので日付で判定する）
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
 * 手動登録の試験（小テスト/中間/期末）を、近い順に最大 limit 件返す。
 * 空配列＝表示対象なし（UI側はセクションごと描画しない）。
 */
export function buildExamCountdown(events: ClassEvent[], now: Date, limit = 3): ExamCountdownItem[] {
  if (limit <= 0) return []
  return events
    .map((e) => examItem(e, now))
    .filter((i): i is ExamCountdownItem => i !== null)
    .sort(byTargetAsc)
    .slice(0, limit)
}
