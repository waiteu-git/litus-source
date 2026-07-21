/**
 * デモモード用の架空データ。
 *
 * **完全に架空であること。** 実在の大学名・システム名・科目名・教員名を入れない。
 * 実際の LETUS / CLASS のコンテンツをストア配布バイナリに同梱すると、
 * App Store Review Guideline 5.2.2（第三者サービスのコンテンツ利用）の
 * 主張材料を与えてしまう。`__fixtures__` の実キャプチャHTMLも同じ理由＋
 * PII混入の可能性から流用しない。
 *
 * データが既存の serialize 層を往復することは demoFixtures.test.ts が保証する。
 * ここが壊れると審査中にクラッシュするため、型は必ず実定義に合わせること。
 */
import type { TimetableCollection } from '../collect/timetableMessage'
import type { AssignmentMap } from '../storage/assignmentsSerialize'
import type { BulletinItem } from '../storage/bulletinDigestSerialize'
import type { AttendanceCourseStats } from '../parsers/attendanceStats'
import type { ClassEvent } from '../timetableEvents/classEvent'
import { TERMS_VERSION } from '../legal/termsVersion'

/** デモの基準日。固定値にして表示が毎回変わらないようにする（審査の再現性）。 */
export const DEMO_BASE_DATE = '2026-05-11' // 月曜

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
 * 課題。URL は `demo:` スキームにして実在ドメインを指さない
 * （タップしても外部へ出ない・テストで強制している）。
 * 期限切れ/接近/余裕/提出済みを1件ずつ入れ、意味色の出し分けを審査員が見られるようにする。
 */
export const DEMO_ASSIGNMENTS: AssignmentMap = {
  'demo:assignment/1': {
    url: 'demo:assignment/1',
    courseCode: C_PROG,
    courseName: 'プログラミング入門',
    title: '第4回 演習課題（配列と繰り返し）',
    deadline: '2026-05-12T23:59:00+09:00',
    deadlineText: '2026年5月12日 23:59',
    submissionStatus: 'not_submitted',
    lifecycleStatus: 'active',
    ignored: false,
    firstSeenAt: '2026-05-05T09:00:00+09:00',
    lastSeenAt: '2026-05-11T08:00:00+09:00',
    lastCheckedAt: '2026-05-11T08:00:00+09:00',
  },
  'demo:assignment/2': {
    url: 'demo:assignment/2',
    courseCode: C_MATH,
    courseName: '線形代数学I',
    title: '小テスト（第3章 行列式）',
    deadline: '2026-05-15T17:00:00+09:00',
    deadlineText: '2026年5月15日 17:00',
    submissionStatus: 'not_submitted',
    lifecycleStatus: 'new',
    ignored: false,
    firstSeenAt: '2026-05-10T12:00:00+09:00',
    lastSeenAt: '2026-05-11T08:00:00+09:00',
    lastCheckedAt: '2026-05-11T08:00:00+09:00',
  },
  'demo:assignment/3': {
    url: 'demo:assignment/3',
    courseCode: C_INFO,
    courseName: '情報リテラシー演習',
    title: 'レポート課題（情報倫理について）',
    deadline: '2026-05-29T23:59:00+09:00',
    deadlineText: '2026年5月29日 23:59',
    submissionStatus: 'not_submitted',
    lifecycleStatus: 'active',
    ignored: false,
    firstSeenAt: '2026-05-08T10:00:00+09:00',
    lastSeenAt: '2026-05-11T08:00:00+09:00',
    lastCheckedAt: '2026-05-11T08:00:00+09:00',
  },
  'demo:assignment/4': {
    url: 'demo:assignment/4',
    courseCode: C_PHYS,
    courseName: '物理学基礎',
    title: '第3回 レポート（力学）',
    deadline: '2026-05-08T23:59:00+09:00',
    deadlineText: '2026年5月8日 23:59',
    submissionStatus: 'submitted',
    lifecycleStatus: 'submitted',
    ignored: false,
    firstSeenAt: '2026-05-01T09:00:00+09:00',
    lastSeenAt: '2026-05-11T08:00:00+09:00',
    lastCheckedAt: '2026-05-11T08:00:00+09:00',
  },
}

export const DEMO_BULLETINS: BulletinItem[] = [
  {
    id: 'demo-bulletin-1',
    category: '授業関連',
    title: '【DEMO103】物理学基礎 休講のお知らせ',
    date: '2026-05-11',
    meta: 'デモ学務課',
    unread: true,
    flagged: false,
    important: false,
    body: {
      from: 'デモ学務課',
      category: '授業関連',
      subject: '【DEMO103】物理学基礎 休講のお知らせ',
      text: '5月12日(火)2限の「物理学基礎」は担当教員都合により休講とします。補講日程は追ってお知らせします。',
      period: '2026-05-11 〜 2026-05-19',
      hasAttachment: false,
    },
  },
  {
    id: 'demo-bulletin-2',
    category: '授業関連',
    title: '【DEMO105】プログラミング入門 教室変更',
    date: '2026-05-10',
    meta: 'デモ学務課',
    unread: true,
    flagged: false,
    important: false,
    body: {
      from: 'デモ学務課',
      category: '授業関連',
      subject: '【DEMO105】プログラミング入門 教室変更',
      text: '5月14日(木)4限の「プログラミング入門」は、デモ棟情報演習室からデモ棟402へ変更します。',
      period: '2026-05-10 〜 2026-05-15',
      hasAttachment: false,
    },
  },
  {
    id: 'demo-bulletin-3',
    category: '事務連絡',
    title: '定期健康診断の実施について',
    date: '2026-05-07',
    meta: 'デモ保健センター',
    unread: false,
    flagged: true,
    important: true,
    body: {
      from: 'デモ保健センター',
      category: '事務連絡',
      subject: '定期健康診断の実施について',
      text: '5月20日(水)〜22日(金)に定期健康診断を実施します。受診は必須です。詳細は掲示の添付資料を確認してください。',
      period: '2026-05-07 〜 2026-05-22',
      hasAttachment: true,
    },
  },
]

export const DEMO_ATTENDANCE_STATS: AttendanceCourseStats[] = [
  {
    courseCode: C_INFO,
    courseName: '情報リテラシー演習',
    slots: [{ day: 'mon', period: 1 }],
    ratePercent: 100,
    sessions: [
      { date: '2026-04-13', mark: 'present' },
      { date: '2026-04-20', mark: 'present' },
      { date: '2026-04-27', mark: 'present' },
      { date: '2026-05-11', mark: 'present' },
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
      { date: '2026-04-13', mark: 'present' },
      { date: '2026-04-17', mark: 'present' },
      { date: '2026-04-20', mark: 'late' },
      { date: '2026-04-24', mark: 'present' },
      { date: '2026-05-01', mark: 'absent' },
      { date: '2026-05-08', mark: 'present' },
    ],
  },
  {
    courseCode: C_PHYS,
    courseName: '物理学基礎',
    slots: [{ day: 'tue', period: 2 }],
    ratePercent: 75,
    sessions: [
      { date: '2026-04-14', mark: 'present' },
      { date: '2026-04-21', mark: 'absent' },
      { date: '2026-04-28', mark: 'present' },
      { date: '2026-05-12', mark: 'canceled' },
    ],
  },
]

export const DEMO_CLASS_EVENTS: ClassEvent[] = [
  {
    id: 'demo-event-1',
    courseName: '物理学基礎',
    courseCode: C_PHYS,
    type: 'cancel',
    date: '2026-05-12',
    periods: [2],
    room: null,
    note: '担当教員都合により休講',
    createdAt: '2026-05-11T09:00:00+09:00',
    // 休講→補講の導線を審査員が見られるよう、補講確定まで入れておく。
    makeupStatus: 'has',
    makeup: { date: '2026-05-26', periods: [2], room: 'デモ棟305' },
  },
  {
    id: 'demo-event-2',
    courseName: 'プログラミング入門',
    courseCode: C_PROG,
    type: 'roomChange',
    date: '2026-05-14',
    periods: [4],
    room: 'デモ棟402',
    note: null,
    createdAt: '2026-05-10T14:00:00+09:00',
  },
  {
    id: 'demo-event-3',
    courseName: '線形代数学I',
    courseCode: C_MATH,
    type: 'midterm',
    date: '2026-05-25',
    periods: [3],
    room: 'デモ棟203',
    note: '第1〜4章が範囲',
    createdAt: '2026-05-09T10:00:00+09:00',
  },
]

/** デモ起動時に同意画面へ戻らないよう、現行版に同意済みとして入れる。 */
export const DEMO_TERMS_CONSENT: number = TERMS_VERSION

/** デモ起動時にチュートリアルスライドへ戻らないよう、完了済みとして入れる。 */
export const DEMO_ONBOARDING = true
