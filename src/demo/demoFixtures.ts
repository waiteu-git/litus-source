/**
 * デモモード用の架空データ。
 *
 * **完全に架空であること。** 実在の大学名・システム名・科目名・教員名を入れない。
 * 実際の LETUS / CLASS のコンテンツをストア配布バイナリに同梱すると、
 * App Store Review Guideline 5.2.2（第三者サービスのコンテンツ利用）の
 * 主張材料を与えてしまう。`__fixtures__` の実キャプチャHTMLも同じ理由＋
 * PII混入の可能性から流用しない。
 *
 * **日付は必ず now からの相対で作ること。** 固定日付にすると、審査を受ける時期には
 * 全部が過去になり「該当する課題はありません」しか出ない＝ Apple が 2.1 で要求する
 * "exhibits your app's full features and functionality" を満たせない。
 *
 * データが既存の serialize 層を往復することは demoFixtures.test.ts が保証する。
 * ここが壊れると審査中にクラッシュするため、型は必ず実定義に合わせること。
 */
import type { TimetableCollection } from '../collect/timetableMessage'
import type { AssignmentMap } from '../storage/assignmentsSerialize'
import type { BulletinItem } from '../storage/bulletinDigestSerialize'
import type { AttendanceCourseStats, AttendanceMark } from '../parsers/attendanceStats'
import type { DayOfWeek } from '../parsers/timetable'
import type { ClassEvent } from '../timetableEvents/classEvent'
import type { LetusBody, LetusBodyMap } from '../storage/letusBodySerialize'
import type { TimetableOverrides } from '../timetableEvents/quarter'
import { TERMS_VERSION } from '../legal/termsVersion'

const pad = (n: number) => String(n).padStart(2, '0')
/** 'YYYY-MM-DD'（ローカル）。 */
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
const atTime = (d: Date, h: number, m: number) => {
  const x = new Date(d)
  x.setHours(h, m, 0, 0)
  return x
}
/** now 以降で最初に該当曜日が来る日（0=日曜）。今日が該当日ならその日。 */
const nextDow = (now: Date, dow: number) => addDays(now, (dow - now.getDay() + 7) % 7)
const jp = (d: Date) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`

const TEACHER_A = '山田 太郎'
const TEACHER_B = '佐藤 花子'
const TEACHER_C = '鈴木 一郎'
const TEACHER_D = '田中 健'
const TEACHER_E = '高橋 美咲'

/** 架空の科目コード。実在の採番規則に寄せない。 */
const C_INFO = 'DEMO101'
const C_MATH = 'DEMO102'
const C_PHYS = 'DEMO103'
const C_ENG = 'DEMO104'
const C_PROG = 'DEMO105'
const C_CALC = 'DEMO106'
const C_CHEM = 'DEMO107'
const C_SOC = 'DEMO108'
const C_LAB = 'DEMO109'
const C_APPM = 'DEMO110'
const C_STAT = 'DEMO111'
const C_PE = 'DEMO112'
const C_PROGEX = 'DEMO113'

type DemoClass = TimetableCollection['slots'][number]['classes'][number]
const cls = (
  courseCode: string,
  name: string,
  teacher: string,
  room: string,
  credits: number,
): DemoClass => ({
  courseCode,
  name,
  teachers: [teacher],
  room,
  isRemote: room.includes('遠隔'),
  credits,
  badges: [],
})

/**
 * 週16コマ。**密度は機能の一部**として扱う。
 *
 * 6コマを5日に散らした初版は最多の曜日でも2コマで、画面の下半分が空いたまま審査員に見えていた。
 * グリッドは常に6限まで行を描くので、実在の時間割らしい密度（1〜4限中心・5限は数コマ・
 * 6限は空き）に寄せる。
 *
 * **既存データが指す曜限は動かさないこと。** 出欠統計（mon1 / mon3+fri2 / tue2）と
 * 授業イベント（火2休講・木4教室変更・月3期末）が曜限を名指ししており、ズレると
 * 「休講のはずのコマに授業が無い」といった食い違いが画面に出る（demoFixtures.test.ts が固定）。
 *
 * 火1は**積みコマ**（同一曜限2科目）。CLASS は 1Q/2Q を公開しないため、同一曜限に2科目
 * 積まれていること自体が半期科目のシグナル、というのがリタス固有の機能の前提になっている。
 * ここが1つも無いと TimetableScreen の hasStacked が常に false で、前半/後半トグルが
 * 一度も描画されない＝審査員がこの機能を見られない。
 */
export const DEMO_TIMETABLE: TimetableCollection[] = [
  {
    slots: [
      { day: 'mon', period: 1, classes: [cls(C_INFO, '情報リテラシー演習', TEACHER_A, 'デモ棟101', 2)] },
      { day: 'mon', period: 2, classes: [cls(C_CALC, '微分積分学I', TEACHER_D, 'デモ棟202', 2)] },
      { day: 'mon', period: 3, classes: [cls(C_MATH, '線形代数学I', TEACHER_B, 'デモ棟203', 2)] },
      { day: 'mon', period: 4, classes: [cls(C_SOC, '科学技術と社会', TEACHER_E, 'デモ棟大講義室', 2)] },
      {
        day: 'tue',
        period: 1,
        // 積みコマ（半期科目）。前半/後半は DEMO_TIMETABLE_OVERRIDES で指定する。
        classes: [
          cls(C_APPM, '応用数学入門', TEACHER_D, 'デモ棟204', 1),
          cls(C_STAT, '統計学入門', TEACHER_E, 'デモ棟204', 1),
        ],
      },
      { day: 'tue', period: 2, classes: [cls(C_PHYS, '物理学基礎', TEACHER_C, 'デモ棟305', 2)] },
      { day: 'tue', period: 3, classes: [cls(C_CHEM, '化学基礎', TEACHER_C, 'デモ棟301', 2)] },
      { day: 'wed', period: 1, classes: [cls(C_ENG, '英語コミュニケーション', TEACHER_B, '遠隔', 1)] },
      { day: 'wed', period: 3, classes: [cls(C_LAB, '基礎化学実験', TEACHER_C, 'デモ棟実験室A', 1)] },
      { day: 'wed', period: 4, classes: [cls(C_LAB, '基礎化学実験', TEACHER_C, 'デモ棟実験室A', 1)] },
      { day: 'thu', period: 2, classes: [cls(C_CALC, '微分積分学I', TEACHER_D, 'デモ棟202', 2)] },
      { day: 'thu', period: 3, classes: [cls(C_CHEM, '化学基礎', TEACHER_C, 'デモ棟301', 2)] },
      { day: 'thu', period: 4, classes: [cls(C_PROG, 'プログラミング入門', TEACHER_A, 'デモ棟情報演習室', 2)] },
      { day: 'fri', period: 1, classes: [cls(C_PE, '健康・スポーツ科学', TEACHER_E, 'デモ体育館', 1)] },
      { day: 'fri', period: 2, classes: [cls(C_MATH, '線形代数学I', TEACHER_B, 'デモ棟203', 2)] },
      { day: 'fri', period: 5, classes: [cls(C_PROGEX, 'プログラミング演習', TEACHER_A, 'デモ棟情報演習室', 1)] },
    ],
    periodTimes: {
      campus: 'デモキャンパス',
      periods: [
        { period: 1, start: '09:00', end: '10:30' },
        { period: 2, start: '10:40', end: '12:10' },
        { period: 3, start: '13:00', end: '14:30' },
        { period: 4, start: '14:40', end: '16:10' },
        { period: 5, start: '16:20', end: '17:50' },
        // グリッドは授業が無くても6限まで行を描く。時刻が引けないと行が空欄になるので入れておく。
        { period: 6, start: '18:00', end: '19:30' },
      ],
    },
  },
]

/**
 * 積みコマの前半/後半指定。
 *
 * CLASS は 1Q/2Q をどこにも公開しないため、前半/後半は**ユーザー指定が唯一の情報源**で、
 * 実データでは override ストアにしか入らない。デモも同じ経路（ストア→applyQuarterOverrides）に
 * 通すことで、時間割の薄表示・科目詳細の「半期（クォーター）」セクション・
 * 自動/前半/後半トグルの3箇所が実データと同じように連動する。
 * 指定が無いとトグルは出ても押しても何も変わらず、審査員には壊れて見える。
 */
export const DEMO_TIMETABLE_OVERRIDES: TimetableOverrides = {
  [C_APPM]: { quarter: 'first' },
  [C_STAT]: { quarter: 'second' },
}

/**
 * デモ課題のURL。
 *
 * **架空ドメイン + 実際のMoodleアクティビティ形式**にする必要がある。
 * `isUserManagedUrl`（= `isTargetActivityUrl` のパス判定）が形式を見ており、
 * 独自スキーム（demo:）だと「収集対象外＝手動課題」に分類されてしまい、
 * 詳細画面が「このアクティビティは自動収集の対象外です」になる。アプリの主機能である
 * 自動収集が審査員に見えなくなるうえ、本文も表示されない（実機で確認）。
 *
 * `.invalid` は RFC 2606 で予約された絶対に実在しない TLD。実在の大学ドメインを
 * バイナリに含めずに済む（5.2.2対策）。なおデモ中は GuardedWebView が null を返すので
 * 実際に開かれることはない。
 */
const demoAssignmentUrl = (id: string) =>
  `https://lms.demo.invalid/mod/assign/view.php?id=9900${id}`

/**
 * 課題。URL は架空ドメインにして実在ドメインを指さない
 * （実在ドメインを指さない・テストで強制している）。
 * 期限切れ/接近/余裕/提出済みを1件ずつ入れ、意味色の出し分けを審査員が見られるようにする。
 * **相対日付**にしているのは、固定日付だと審査時期には全件が期限切れになり
 * 「該当する課題はありません」しか出ないため。
 */
export function buildDemoAssignments(now: Date): AssignmentMap {
  const seen = new Date(now).toISOString()
  const soon = atTime(addDays(now, 1), 23, 59) // 接近（24h以内=danger寄り）
  const week = atTime(addDays(now, 4), 17, 0) // 数日後（warn）
  const far = atTime(addDays(now, 18), 23, 59) // 余裕（無彩色）
  const past = atTime(addDays(now, -3), 23, 59) // 提出済み
  const mk = (
    id: string,
    courseCode: string,
    courseName: string,
    title: string,
    deadline: Date,
    submitted: boolean,
  ) => ({
    url: demoAssignmentUrl(id),
    courseCode,
    courseName,
    title,
    deadline: deadline.toISOString(),
    deadlineText: jp(deadline),
    submissionStatus: (submitted ? 'submitted' : 'not_submitted') as 'submitted' | 'not_submitted',
    lifecycleStatus: (submitted ? 'submitted' : 'active') as 'submitted' | 'active',
    ignored: false,
    firstSeenAt: seen,
    lastSeenAt: seen,
    lastCheckedAt: seen,
  })
  const list = [
    mk('1', C_PROG, 'プログラミング入門', '第4回 演習課題（配列と繰り返し）', soon, false),
    mk('2', C_MATH, '線形代数学I', '小テスト（第3章 行列式）', week, false),
    mk('3', C_INFO, '情報リテラシー演習', 'レポート課題（情報倫理について）', far, false),
    mk('4', C_PHYS, '物理学基礎', '第3回 レポート（力学）', past, true),
  ]
  return Object.fromEntries(list.map((a) => [a.url, a]))
}

export function buildDemoBulletins(now: Date): BulletinItem[] {
  const cancelDay = nextDow(now, 2) // 火曜=物理学基礎
  const roomDay = nextDow(now, 4) // 木曜=プログラミング入門
  return [
    {
      id: 'demo-bulletin-1',
      category: '授業関連',
      title: `【${C_PHYS}】物理学基礎 休講のお知らせ`,
      date: ymd(now),
      meta: 'デモ学務課',
      unread: true,
      flagged: false,
      important: false,
      body: {
        from: 'デモ学務課',
        category: '授業関連',
        subject: `【${C_PHYS}】物理学基礎 休講のお知らせ`,
        text: `${ymd(cancelDay)} 2限の「物理学基礎」は担当教員都合により休講とします。補講日程は追ってお知らせします。`,
        period: `${ymd(now)} 〜 ${ymd(addDays(now, 8))}`,
        hasAttachment: false,
      },
    },
    {
      id: 'demo-bulletin-2',
      category: '授業関連',
      title: `【${C_PROG}】プログラミング入門 教室変更`,
      date: ymd(addDays(now, -1)),
      meta: 'デモ学務課',
      unread: true,
      flagged: false,
      important: false,
      body: {
        from: 'デモ学務課',
        category: '授業関連',
        subject: `【${C_PROG}】プログラミング入門 教室変更`,
        text: `${ymd(roomDay)} 4限の「プログラミング入門」は、デモ棟情報演習室からデモ棟402へ変更します。`,
        period: `${ymd(addDays(now, -1))} 〜 ${ymd(addDays(now, 5))}`,
        hasAttachment: false,
      },
    },
    {
      id: 'demo-bulletin-3',
      category: '事務連絡',
      title: '定期健康診断の実施について',
      date: ymd(addDays(now, -4)),
      meta: 'デモ保健センター',
      unread: false,
      flagged: true,
      important: true,
      body: {
        from: 'デモ保健センター',
        category: '事務連絡',
        subject: '定期健康診断の実施について',
        text: '定期健康診断を実施します。受診は必須です。詳細は掲示の添付資料を確認してください。',
        period: `${ymd(addDays(now, -4))} 〜 ${ymd(addDays(now, 11))}`,
        hasAttachment: true,
      },
    },
  ]
}

const DOW_NUM: Record<DayOfWeek, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }

/**
 * 出欠の各回パターン。**時間割の全科目ぶん揃える。**
 *
 * 出欠が無い科目の科目詳細は中立の「記録なし」になり、落単ライン（あと◯回休める）の数値UIが
 * 一切出ない。時間割に13科目あって出欠が3科目しか無いと、審査員が適当に科目を開いても
 * 4回に3回はこの機能に当たらない。
 *
 * marks は**古い週から順**（同一週内は slots の並び順）。曜限は DEMO_TIMETABLE と一致させること
 * （demoFixtures.test.ts が突合する）。`p`/`l`/`a` は present/late/absent。
 */
const P = 'present' as const
const L = 'late' as const
const A = 'absent' as const
type DemoStatSpec = {
  code: string
  name: string
  slots: { day: DayOfWeek; period: number }[]
  weeks: number
  marks: AttendanceMark[]
}
const DEMO_STATS: DemoStatSpec[] = [
  { code: C_INFO, name: '情報リテラシー演習', slots: [{ day: 'mon', period: 1 }], weeks: 4, marks: [P, P, P, P] },
  { code: C_CALC, name: '微分積分学I', slots: [{ day: 'mon', period: 2 }, { day: 'thu', period: 2 }], weeks: 3, marks: [P, P, A, P, P, P] },
  { code: C_MATH, name: '線形代数学I', slots: [{ day: 'mon', period: 3 }, { day: 'fri', period: 2 }], weeks: 3, marks: [P, P, L, P, A, P] },
  { code: C_SOC, name: '科学技術と社会', slots: [{ day: 'mon', period: 4 }], weeks: 4, marks: [P, P, P, A] },
  { code: C_APPM, name: '応用数学入門', slots: [{ day: 'tue', period: 1 }], weeks: 4, marks: [P, P, P, P] },
  { code: C_STAT, name: '統計学入門', slots: [{ day: 'tue', period: 1 }], weeks: 4, marks: [P, P, L, P] },
  { code: C_PHYS, name: '物理学基礎', slots: [{ day: 'tue', period: 2 }], weeks: 3, marks: [P, A, P] },
  { code: C_CHEM, name: '化学基礎', slots: [{ day: 'tue', period: 3 }, { day: 'thu', period: 3 }], weeks: 3, marks: [P, P, P, P, A, P] },
  { code: C_ENG, name: '英語コミュニケーション', slots: [{ day: 'wed', period: 1 }], weeks: 4, marks: [P, P, P, P] },
  // 実験は3-4限の2コマ連続。出欠は1回として数えるので曜限は3限だけ持たせる。
  { code: C_LAB, name: '基礎化学実験', slots: [{ day: 'wed', period: 3 }], weeks: 4, marks: [P, P, P, P] },
  { code: C_PROG, name: 'プログラミング入門', slots: [{ day: 'thu', period: 4 }], weeks: 4, marks: [P, L, P, P] },
  { code: C_PE, name: '健康・スポーツ科学', slots: [{ day: 'fri', period: 1 }], weeks: 4, marks: [P, P, A, P] },
  { code: C_PROGEX, name: 'プログラミング演習', slots: [{ day: 'fri', period: 5 }], weeks: 4, marks: [P, P, P, P] },
]

export function buildDemoAttendanceStats(now: Date): AttendanceCourseStats[] {
  /** n週前の該当曜日。 */
  const past = (dow: number, weeksAgo: number) => ymd(addDays(nextDow(now, dow), -7 * weeksAgo))
  return DEMO_STATS.map((s) => {
    const sessions: AttendanceCourseStats['sessions'] = []
    for (let w = s.weeks; w >= 1; w--) {
      for (const sl of s.slots) {
        sessions.push({ date: past(DOW_NUM[sl.day], w), mark: s.marks[sessions.length] ?? 'none' })
      }
    }
    const counted = sessions.filter((x) => x.mark !== 'none').length
    const attended = sessions.filter((x) => x.mark === 'present' || x.mark === 'late').length
    return {
      courseCode: s.code,
      courseName: s.name,
      slots: s.slots,
      ratePercent: counted > 0 ? Math.round((attended / counted) * 100) : null,
      sessions,
    }
  })
}

export function buildDemoClassEvents(now: Date): ClassEvent[] {
  const created = new Date(now).toISOString()
  return [
    {
      id: 'demo-event-1',
      courseName: '物理学基礎',
      courseCode: C_PHYS,
      type: 'cancel',
      date: ymd(nextDow(now, 2)),
      periods: [2],
      room: null,
      note: '担当教員都合により休講',
      createdAt: created,
      // 休講→補講の導線を審査員が見られるよう、補講確定まで入れておく。
      makeupStatus: 'has',
      makeup: { date: ymd(addDays(nextDow(now, 2), 14)), periods: [2], room: 'デモ棟305' },
    },
    {
      id: 'demo-event-2',
      courseName: 'プログラミング入門',
      courseCode: C_PROG,
      type: 'roomChange',
      date: ymd(nextDow(now, 4)),
      periods: [4],
      room: 'デモ棟402',
      note: null,
      createdAt: created,
    },
    {
      id: 'demo-event-3',
      courseName: '線形代数学I',
      courseCode: C_MATH,
      type: 'midterm',
      date: ymd(addDays(nextDow(now, 1), 14)),
      periods: [3],
      room: 'デモ棟203',
      note: '第1〜4章が範囲',
      createdAt: created,
    },
  ]
}


/**
 * 課題本文。これが無いと課題詳細を開いた瞬間に LetusPageFetcher が立ち、
 * デモでは WebView が null を返すので「本文を取得できませんでした」で止まる
 * （審査員が最初に開く画面なので conspicuously broken に見える）。
 */
export function buildDemoBodies(now: Date): LetusBodyMap {
  const at = new Date(now).toISOString()
  const body = (description: string): LetusBody => ({ description, attachments: [], fetchedAt: at })
  return {
    [demoAssignmentUrl('1')]: body(
      '配列と繰り返し処理の演習です。テキスト第4章の例題を参考に、指定された3つの関数を実装して提出してください。提出形式はソースコード一式のzipです。',
    ),
    [demoAssignmentUrl('2')]: body(
      '第3章「行列式」の範囲から出題します。サラスの方法と余因子展開の両方を使えるようにしておいてください。',
    ),
    [demoAssignmentUrl('3')]: body(
      '情報倫理に関するレポートです。授業で扱った事例のいずれかを取り上げ、2000字程度で論じてください。引用元は明記すること。',
    ),
    [demoAssignmentUrl('4')]: body('力学の基礎に関するレポートです。提出済みです。'),
  }
}

/** デモ起動時に同意画面へ戻らないよう、現行版に同意済みとして入れる。 */
export const DEMO_TERMS_CONSENT: number = TERMS_VERSION
