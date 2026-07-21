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
import type { AttendanceCourseStats } from '../parsers/attendanceStats'
import type { ClassEvent } from '../timetableEvents/classEvent'
import type { LetusBody, LetusBodyMap } from '../storage/letusBodySerialize'
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

/** 架空の科目コード。実在の採番規則に寄せない。 */
const C_INFO = 'DEMO101'
const C_MATH = 'DEMO102'
const C_PHYS = 'DEMO103'
const C_ENG = 'DEMO104'
const C_PROG = 'DEMO105'

export const DEMO_TIMETABLE: TimetableCollection[] = [
  {
    slots: [
      {
        day: 'mon',
        period: 1,
        classes: [
          {
            courseCode: C_INFO,
            name: '情報リテラシー演習',
            teachers: [TEACHER_A],
            room: 'デモ棟101',
            isRemote: false,
            credits: 2,
            badges: [],
          },
        ],
      },
      {
        day: 'mon',
        period: 3,
        classes: [
          {
            courseCode: C_MATH,
            name: '線形代数学I',
            teachers: [TEACHER_B],
            room: 'デモ棟203',
            isRemote: false,
            credits: 2,
            badges: [],
          },
        ],
      },
      {
        day: 'tue',
        period: 2,
        classes: [
          {
            courseCode: C_PHYS,
            name: '物理学基礎',
            teachers: [TEACHER_C],
            room: 'デモ棟305',
            isRemote: false,
            credits: 2,
            badges: [],
          },
        ],
      },
      {
        day: 'wed',
        period: 1,
        classes: [
          {
            courseCode: C_ENG,
            name: '英語コミュニケーション',
            teachers: [TEACHER_B],
            room: '遠隔',
            isRemote: true,
            credits: 1,
            badges: [],
          },
        ],
      },
      {
        day: 'thu',
        period: 4,
        classes: [
          {
            courseCode: C_PROG,
            name: 'プログラミング入門',
            teachers: [TEACHER_A],
            room: 'デモ棟情報演習室',
            isRemote: false,
            credits: 2,
            badges: [],
          },
        ],
      },
      {
        day: 'fri',
        period: 2,
        classes: [
          {
            courseCode: C_MATH,
            name: '線形代数学I',
            teachers: [TEACHER_B],
            room: 'デモ棟203',
            isRemote: false,
            credits: 2,
            badges: [],
          },
        ],
      },
    ],
    periodTimes: {
      campus: 'デモキャンパス',
      periods: [
        { period: 1, start: '09:00', end: '10:30' },
        { period: 2, start: '10:40', end: '12:10' },
        { period: 3, start: '13:00', end: '14:30' },
        { period: 4, start: '14:40', end: '16:10' },
        { period: 5, start: '16:20', end: '17:50' },
      ],
    },
  },
]

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

export function buildDemoAttendanceStats(now: Date): AttendanceCourseStats[] {
  /** n週前の該当曜日。 */
  const past = (dow: number, weeksAgo: number) => ymd(addDays(nextDow(now, dow), -7 * weeksAgo))
  return [
    {
      courseCode: C_INFO,
      courseName: '情報リテラシー演習',
      slots: [{ day: 'mon', period: 1 }],
      ratePercent: 100,
      sessions: [
        { date: past(1, 4), mark: 'present' },
        { date: past(1, 3), mark: 'present' },
        { date: past(1, 2), mark: 'present' },
        { date: past(1, 1), mark: 'present' },
      ],
    },
    {
      courseCode: C_MATH,
      courseName: '線形代数学I',
      slots: [
        { day: 'mon', period: 3 },
        { day: 'fri', period: 2 },
      ],
      ratePercent: 83,
      sessions: [
        { date: past(1, 3), mark: 'present' },
        { date: past(5, 3), mark: 'present' },
        { date: past(1, 2), mark: 'late' },
        { date: past(5, 2), mark: 'present' },
        { date: past(1, 1), mark: 'absent' },
        { date: past(5, 1), mark: 'present' },
      ],
    },
    {
      courseCode: C_PHYS,
      courseName: '物理学基礎',
      slots: [{ day: 'tue', period: 2 }],
      ratePercent: 75,
      sessions: [
        { date: past(2, 3), mark: 'present' },
        { date: past(2, 2), mark: 'absent' },
        { date: past(2, 1), mark: 'present' },
      ],
    },
  ]
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
