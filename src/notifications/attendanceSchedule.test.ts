import { computeAttendanceAlarms, buildAttendanceNotificationContent, consecutiveRuns } from './attendanceSchedule'
import type { TimetableCollection } from '../collect/timetableMessage'
import type { CourseTermInfo } from '../attendance/courseOver'
import { attendanceNoticeId, excludeNotices, isAttendanceNoticeId, isStartNoticeId, mergeAttendanceNotices, spanMinutes, startOfLocalDay, todaySlotNotices, upcomingAttendanceNotices } from './attendanceSchedule'
import { staggerSameInstant, DEFAULT_STAGGER_STEP_MS } from './staggerFireAt'
import { buildAttendanceNoticeContent, noticeTitleName, type AttendanceNotice, type NoticeTitleContext } from './attendanceSchedule'

// 2026-07-06 は月曜日
const MONDAY_NOON = new Date(2026, 6, 6, 12, 0, 0, 0)

function collection(): TimetableCollection {
  return {
    slots: [
      { day: 'mon', period: 3, classes: [{ courseCode: '9973339', name: '基礎情報工学A', teachers: ['高木'], room: 'K101', isRemote: false, credits: 2, badges: [] }] },
    ],
    periodTimes: { campus: '野田', periods: [{ period: 3, start: '13:10', end: '14:40' }] },
  }
}

describe('computeAttendanceAlarms', () => {
  it('当日・未来のコマに開始＋ラストチャンスの2件を出す', () => {
    const alarms = computeAttendanceAlarms([collection()], {}, MONDAY_NOON, { daysAhead: 1, lastChanceLeadMinutes: 10 })
    expect(alarms).toHaveLength(2)
    expect(alarms[0]).toMatchObject({ kind: 'attendance-start', courseCode: '9973339', period: 3, day: 'mon' })
    expect(new Date(alarms[0].fireAt)).toEqual(new Date(2026, 6, 6, 13, 10, 0, 0))
    expect(alarms[1]).toMatchObject({ kind: 'attendance-last-chance' })
    expect(new Date(alarms[1].fireAt)).toEqual(new Date(2026, 6, 6, 14, 30, 0, 0))
  })

  it('settingsでcourseCodeがfalseの科目は除外', () => {
    const alarms = computeAttendanceAlarms([collection()], { '9973339': false }, MONDAY_NOON, { daysAhead: 1 })
    expect(alarms).toEqual([])
  })

  it('periodTimesが無ければ時刻を決められず0件', () => {
    const c = collection()
    c.periodTimes = null
    expect(computeAttendanceAlarms([c], {}, MONDAY_NOON, { daysAhead: 1 })).toEqual([])
  })

  it('発火時刻が過去のものは出さない（開始13:10より後の15:00起点なら両方過去）', () => {
    const afterClass = new Date(2026, 6, 6, 15, 0, 0, 0)
    expect(computeAttendanceAlarms([collection()], {}, afterClass, { daysAhead: 1 })).toEqual([])
  })

  it('daysAheadで翌週の同一曜日も拾う', () => {
    const alarms = computeAttendanceAlarms([collection()], {}, MONDAY_NOON, { daysAhead: 8, lastChanceLeadMinutes: 10 })
    // 今週月(2件) + 来週月(2件)
    expect(alarms).toHaveLength(4)
  })
})

describe('buildAttendanceNotificationContent', () => {
  const base = { courseCode: '9973339', courseName: '基礎情報工学A', day: 'mon' as const, period: 3 }
  const start = () => buildAttendanceNotificationContent({ ...base, kind: 'attendance-start', fireAt: '' })
  const last = (endsAt?: string) =>
    buildAttendanceNotificationContent({ ...base, kind: 'attendance-last-chance', fireAt: '', endsAt })

  it('開始とラストチャンスで文面が変わる', () => {
    expect(start().title).toContain('基礎情報工学A')
    expect(start().body).not.toEqual(last('14:40').body)
  })

  // 手首（スマートウォッチ）は表示幅が狭く、ミラーされた通知は題名＋本文の数行しか出ない。
  // 題名が既に科目名を持つので、本文でも繰り返すと**狭い画面の1行を同じ情報で潰す**。
  // 本文の行は「いま何が起きたか／あとどれだけ猶予があるか」に使う。
  it('本文で科目名を繰り返さない（題名に既にあるため）', () => {
    expect(start().body).not.toContain('基礎情報工学A')
    expect(last('14:40').body).not.toContain('基礎情報工学A')
  })

  // 出席は秒単位で価値がある情報なので、ラストチャンスは「あとどれだけか」を持つ。
  // **相対の残り分数ではなく授業終了の絶対時刻**を出す: Android 12+ では
  // SCHEDULE_EXACT_ALARM を宣言していない＝予約が setAndAllowWhileIdle（不正確）で、
  // 実際の発火が数分ずれうる。「残り10分」は遅延ぶんだけ嘘になるが、終了時刻は
  // いつ発火しても真のまま（[[litus-notification-architecture]] の exact alarm 不採用の帰結）。
  it('ラストチャンスは授業終了の絶対時刻を出す（ずれても嘘にならない）', () => {
    expect(last('14:40').body).toContain('14:40')
    expect(last('14:40').body).not.toContain('残り')
  })

  it('終了時刻が無ければ時刻を騙らずフォールバックする', () => {
    const b = last(undefined).body
    expect(b).not.toContain('undefined')
    expect(b.length).toBeGreaterThan(0)
  })

  // 手首では題名が同一だと2通が見分けられない。本文の**先頭**で段階が分かること。
  it('開始とラストチャンスは本文の先頭で見分けられる', () => {
    expect(start().body.slice(0, 6)).not.toEqual(last('14:40').body.slice(0, 6))
  })
})

describe('computeAttendanceAlarms: endsAt', () => {
  it('ラストチャンスに授業終了時刻(HH:MM)を載せる', () => {
    const alarms = computeAttendanceAlarms([collection()], {}, MONDAY_NOON, { daysAhead: 1, lastChanceLeadMinutes: 10 })
    expect(alarms[1]).toMatchObject({ kind: 'attendance-last-chance', endsAt: '14:40' })
  })

  it('連続コマは塊の末尾の終了時刻を載せる', () => {
    const c: TimetableCollection = {
      slots: [
        { day: 'mon', period: 4, classes: [{ courseCode: 'L1', name: '物理学実験Ａ', teachers: [], room: 'K1', isRemote: false, credits: 2, badges: [] }] },
        { day: 'mon', period: 5, classes: [{ courseCode: 'L1', name: '物理学実験Ａ', teachers: [], room: 'K1', isRemote: false, credits: 2, badges: [] }] },
      ],
      periodTimes: { campus: '野田', periods: [{ period: 4, start: '14:40', end: '16:10' }, { period: 5, start: '16:20', end: '17:50' }] },
    }
    const alarms = computeAttendanceAlarms([c], {}, MONDAY_NOON, { daysAhead: 1, lastChanceLeadMinutes: 10 })
    const lc = alarms.find((a) => a.kind === 'attendance-last-chance')
    expect(lc?.endsAt).toBe('17:50')
  })
})

describe('consecutiveRuns', () => {
  it('連続する時限を1塊にする', () => {
    expect(consecutiveRuns([4, 5])).toEqual([[4, 5]])
    expect(consecutiveRuns([1, 2, 3])).toEqual([[1, 2, 3]])
  })
  it('離れた時限は別の塊（同日に2回ある授業）', () => {
    expect(consecutiveRuns([1, 5])).toEqual([[1], [5]])
    expect(consecutiveRuns([4, 5, 7])).toEqual([[4, 5], [7]])
  })
  it('順不同・重複を正規化する', () => {
    expect(consecutiveRuns([5, 4, 4])).toEqual([[4, 5]])
  })
  it('空は空', () => {
    expect(consecutiveRuns([])).toEqual([])
  })
})

describe('連続コマの二重通知（実フィクスチャ由来の回帰防止）', () => {
  // CLASSは連続コマを時限ごとの別セルで返す。実フィクスチャ timetable-real.html では
  // 物理学実験Ａが tue4(14:40-16:10) と tue5(16:20-17:50) の2slotに出る＝実験1回で14:40〜17:50。
  // 修正前は4通届き、16:00「まだなら今のうちに」と16:20「入力できるか確認しましょう」が
  // 実験の最中に20分間隔でMAXチャンネルで鳴っていた。
  const cls = (courseCode: string, name: string) => ({
    courseCode, name, teachers: [], room: 'K101', isRemote: false, credits: 2, badges: [],
  })
  const lab: TimetableCollection = {
    periodTimes: {
      campus: '野田',
      periods: [
        { period: 4, start: '14:40', end: '16:10' },
        { period: 5, start: '16:20', end: '17:50' },
      ],
    },
    slots: [
      { day: 'tue', period: 4, classes: [cls('9973344', '物理学実験Ａ')] },
      { day: 'tue', period: 5, classes: [cls('9973344', '物理学実験Ａ')] },
    ],
  }

  const monday = new Date(2026, 6, 20, 9, 0) // 2026-07-20(月) → 火曜は翌日

  it('連続コマは4通ではなく2通', () => {
    const alarms = computeAttendanceAlarms([lab], {}, monday)
    expect(alarms).toHaveLength(2)
  })

  it('開始はブロックの先頭、終了前はブロックの末尾から数える', () => {
    const alarms = computeAttendanceAlarms([lab], {}, monday)
    const start = alarms.find((a) => a.kind === 'attendance-start')
    const last = alarms.find((a) => a.kind === 'attendance-last-chance')
    expect(new Date(start!.fireAt).getHours()).toBe(14)
    expect(new Date(start!.fireAt).getMinutes()).toBe(40)
    // 5限の終了17:50の10分前＝17:40（4限の終了16:10ではない）
    expect(new Date(last!.fireAt).getHours()).toBe(17)
    expect(new Date(last!.fireAt).getMinutes()).toBe(40)
  })

  it('同一文面が二度届かない', () => {
    const alarms = computeAttendanceAlarms([lab], {}, monday)
    const texts = alarms.map((a) => JSON.stringify(buildAttendanceNotificationContent(a)))
    expect(new Set(texts).size).toBe(texts.length)
  })

  it('16:00と16:20に鳴らない（実験の最中の連打を止める）', () => {
    const alarms = computeAttendanceAlarms([lab], {}, monday)
    const hhmm = alarms.map((a) => {
      const d = new Date(a.fireAt)
      return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
    })
    expect(hhmm).not.toContain('16:00')
    expect(hhmm).not.toContain('16:20')
  })

  it('別の曜日の同一科目は別授業回として残す（束ねすぎない）', () => {
    const twoDays: TimetableCollection = {
      periodTimes: {
        campus: '野田',
        periods: [
          { period: 1, start: '09:00', end: '10:30' },
          { period: 3, start: '12:50', end: '14:30' },
        ],
      },
      slots: [
        { day: 'mon', period: 1, classes: [cls('9973337', '基礎電気数学')] },
        { day: 'fri', period: 3, classes: [cls('9973337', '基礎電気数学')] },
      ],
    }
    const alarms = computeAttendanceAlarms([twoDays], {}, new Date(2026, 6, 19, 9, 0)) // 日曜
    // 月1で2通・金3で2通＝計4通（曜日が違う＝別の授業回なので束ねない）
    expect(alarms).toHaveLength(4)
    expect(new Set(alarms.map((a) => a.day))).toEqual(new Set(['mon', 'fri']))
  })

  it('同日でも離れた時限は別セッション（1限と5限）', () => {
    const split: TimetableCollection = {
      periodTimes: {
        campus: '野田',
        periods: [
          { period: 1, start: '09:00', end: '10:30' },
          { period: 5, start: '16:20', end: '17:50' },
        ],
      },
      slots: [
        { day: 'tue', period: 1, classes: [cls('X1', 'ゼミ')] },
        { day: 'tue', period: 5, classes: [cls('X1', 'ゼミ')] },
      ],
    }
    expect(computeAttendanceAlarms([split], {}, monday)).toHaveLength(4)
  })

  it('科目別OFFは連続コマごと消える', () => {
    expect(computeAttendanceAlarms([lab], { '9973344': false }, monday)).toEqual([])
  })
})

describe('休講のコマに出席アラームを出さない', () => {
  // 修正前は休講を登録しても同じ日に「◯◯ 休講」(当日8:00)と「◯◯ 出席コード」(開始時/終了10分前)が
  // 両方届いていた。ホームは同じ日に「休講」タグを出しており、UI表示と通知が食い違っていた。
  const cls = (courseCode: string, name: string) => ({
    courseCode, name, teachers: [], room: 'K101', isRemote: false, credits: 2, badges: [],
  })
  const col: TimetableCollection = {
    periodTimes: {
      campus: '野田',
      periods: [
        { period: 3, start: '13:10', end: '14:40' },
        { period: 4, start: '14:50', end: '16:20' },
      ],
    },
    slots: [
      { day: 'mon', period: 3, classes: [cls('C1', '線形代数1')] },
      { day: 'mon', period: 4, classes: [cls('C2', '物理学1')] },
    ],
  }
  // 2026-07-20 は月曜
  const sunday = new Date(2026, 6, 19, 9, 0)

  it('休講登録があればその科目のアラームは出ない', () => {
    const alarms = computeAttendanceAlarms([col], {}, sunday, { daysAhead: 2 }, [
      { date: '2026-07-20', periods: [3], courseCode: 'C1', courseName: '線形代数1' },
    ])
    expect(alarms.filter((a) => a.courseCode === 'C1')).toEqual([])
  })

  it('同じ日の別科目は巻き込まない（日付＋時限だけで消さない）', () => {
    const alarms = computeAttendanceAlarms([col], {}, sunday, { daysAhead: 2 }, [
      { date: '2026-07-20', periods: [3], courseCode: 'C1', courseName: '線形代数1' },
    ])
    expect(alarms.filter((a) => a.courseCode === 'C2')).toHaveLength(2)
  })

  it('別の日の休講はその日にしか効かない', () => {
    const alarms = computeAttendanceAlarms([col], {}, sunday, { daysAhead: 2 }, [
      { date: '2026-07-27', periods: [3], courseCode: 'C1', courseName: '線形代数1' },
    ])
    expect(alarms.filter((a) => a.courseCode === 'C1')).toHaveLength(2)
  })

  it('courseCodeがnull（掲示由来）でも科目名で照合する', () => {
    const alarms = computeAttendanceAlarms([col], {}, sunday, { daysAhead: 2 }, [
      { date: '2026-07-20', periods: [3], courseCode: null, courseName: '線形代数1' },
    ])
    expect(alarms.filter((a) => a.courseCode === 'C1')).toEqual([])
  })

  it('courseCodeもnullで科目名も一致しなければアラームを出す（黙って殺さない）', () => {
    const alarms = computeAttendanceAlarms([col], {}, sunday, { daysAhead: 2 }, [
      { date: '2026-07-20', periods: [3], courseCode: null, courseName: '別の科目' },
    ])
    expect(alarms.filter((a) => a.courseCode === 'C1')).toHaveLength(2)
  })

  it('連続コマの一部だけ休講なら残りのコマで組み直す', () => {
    const lab: TimetableCollection = {
      periodTimes: {
        campus: '野田',
        periods: [
          { period: 4, start: '14:40', end: '16:10' },
          { period: 5, start: '16:20', end: '17:50' },
        ],
      },
      slots: [
        { day: 'mon', period: 4, classes: [cls('L', '実験')] },
        { day: 'mon', period: 5, classes: [cls('L', '実験')] },
      ],
    }
    const alarms = computeAttendanceAlarms([lab], {}, sunday, { daysAhead: 2 }, [
      { date: '2026-07-20', periods: [5], courseCode: 'L', courseName: '実験' },
    ])
    expect(alarms).toHaveLength(2)
    const last = alarms.find((a) => a.kind === 'attendance-last-chance')!
    // 5限が休講なので終了は4限の16:10 → その10分前＝16:00（17:40ではない）
    expect(new Date(last.fireAt).getHours()).toBe(16)
    expect(new Date(last.fireAt).getMinutes()).toBe(0)
  })

  it('休講リストを渡さなければ従来どおり全コマに出す', () => {
    expect(computeAttendanceAlarms([col], {}, sunday, { daysAhead: 2 })).toHaveLength(4)
  })
})

describe('学期の授業回が終わった科目に出席アラームを出さない', () => {
  // 2026-08-03のユーザー報告「授業が終了している期間なのに出席アラームが来る」。
  // 2026-07-24(build 104)で isCourseActiveOn を入れたが、通したのは**画面だけ**
  // （ホームのお知らせ・右下のFAB）。予約通知はこの述語を一切通っておらず、
  // 時間割にコマが残っている限り前期終了後も毎週鳴り続けていた。
  // 画面に入れた対策は通知には自動では効かない、の実例。
  const cls = (courseCode: string, name: string) => ({
    courseCode, name, teachers: [], room: 'K101', isRemote: false, credits: 2, badges: [],
  })
  const col: TimetableCollection = {
    periodTimes: {
      campus: '野田',
      periods: [
        { period: 3, start: '13:10', end: '14:40' },
        { period: 4, start: '14:50', end: '16:20' },
      ],
    },
    slots: [
      { day: 'mon', period: 3, classes: [cls('C1', '線形代数1')] },
      { day: 'mon', period: 4, classes: [cls('C2', '物理学1')] },
    ],
  }
  // 2026-07-19(日)起点・daysAhead 2 → 対象日は 07-19(日) と 07-20(月)。コマは月曜だけ。
  const sunday = new Date(2026, 6, 19, 9, 0)
  const ends = (m: Record<string, string>, nameOwners: Record<string, string> = {}): CourseTermInfo => ({ termEnds: m, nameOwners, calendar: null, extraPlans: [] })

  it('最終授業日を過ぎた科目のアラームは出ない', () => {
    const alarms = computeAttendanceAlarms([col], {}, sunday, { daysAhead: 2 }, [], ends({ C1: '2026-07-13' }))
    expect(alarms.filter((a) => a.courseCode === 'C1')).toEqual([])
  })

  it('最終授業日の当日はまだ出す（境界は当日を含む）', () => {
    const alarms = computeAttendanceAlarms([col], {}, sunday, { daysAhead: 2 }, [], ends({ C1: '2026-07-20' }))
    expect(alarms.filter((a) => a.courseCode === 'C1')).toHaveLength(2)
  })

  it('学期が終わった科目だけを落とす（同じ日の別科目を巻き込まない）', () => {
    const alarms = computeAttendanceAlarms([col], {}, sunday, { daysAhead: 2 }, [], ends({ C1: '2026-07-13' }))
    expect(alarms.filter((a) => a.courseCode === 'C2')).toHaveLength(2)
  })

  // 104の仕様「期末や補講など、その日に授業があると分かっている予定があるときは今までどおり出す」を
  // 予約通知側でも守る。ここが効かないと、学期終了後の補講で出席アラームが来なくなる（別の不具合）。
  it('学期終了後でも同日に追加の予定があれば出す', () => {
    const alarms = computeAttendanceAlarms([col], {}, sunday, { daysAhead: 2 }, [], {
      termEnds: { C1: '2026-07-13' }, nameOwners: {}, calendar: null,
      extraPlans: [{ courseCode: 'C1', courseName: '線形代数1', date: '2026-07-20' }],
    })
    expect(alarms.filter((a) => a.courseCode === 'C1')).toHaveLength(2)
  })

  it('別の日の追加の予定では復活しない', () => {
    const alarms = computeAttendanceAlarms([col], {}, sunday, { daysAhead: 2 }, [], {
      termEnds: { C1: '2026-07-13' }, nameOwners: {}, calendar: null,
      extraPlans: [{ courseCode: 'C1', courseName: '線形代数1', date: '2026-07-27' }],
    })
    expect(alarms.filter((a) => a.courseCode === 'C1')).toEqual([])
  })

  it('courseCodeを持たない予定（掲示由来）は科目名で照合して復活する', () => {
    const alarms = computeAttendanceAlarms([col], {}, sunday, { daysAhead: 2 }, [], {
      termEnds: { C1: '2026-07-13' }, nameOwners: {}, calendar: null,
      extraPlans: [{ courseCode: null, courseName: '線形代数1', date: '2026-07-20' }],
    })
    expect(alarms.filter((a) => a.courseCode === 'C1')).toHaveLength(2)
  })

  // ⚠出欠が未収集の端末（新規インストール直後）で通知が全部消えないこと。
  // 学期終了が「不明」なら従来どおり出す＝fail-open。逆に倒すと9月の新規ユーザーに1件も鳴らない。
  it('出欠データが無ければ従来どおり出す（fail-open）', () => {
    const alarms = computeAttendanceAlarms([col], {}, sunday, { daysAhead: 2 }, [], ends({}))
    expect(alarms).toHaveLength(4)
  })

  it('termInfoを渡さなければ従来どおり全コマに出す', () => {
    expect(computeAttendanceAlarms([col], {}, sunday, { daysAhead: 2 }, [])).toHaveLength(4)
  })

  it('科目名でも最終授業日を引ける（出欠側でcourseCodeが取れない科目）', () => {
    const alarms = computeAttendanceAlarms([col], {}, sunday, { daysAhead: 2 }, [], ends({ 線形代数1: '2026-07-13' }))
    expect(alarms.filter((a) => a.courseCode === 'C1')).toEqual([])
    expect(alarms.filter((a) => a.courseCode === 'C2')).toHaveLength(2)
  })

  it('休講と学期終了は独立に効く（両方渡しても取りこぼさない）', () => {
    const alarms = computeAttendanceAlarms(
      [col],
      {},
      sunday,
      { daysAhead: 2 },
      [{ date: '2026-07-20', periods: [4], courseCode: 'C2', courseName: '物理学1' }],
      ends({ C1: '2026-07-13' }),
    )
    expect(alarms).toEqual([])
  })
})

// ---- N1（2026-09-12）: 同じ種類・同じ時刻を1枠にまとめる（設計 §4.1・§4.2・§7-T2/T3） ----
const n1cls = (courseCode: string, name: string) => ({
  courseCode, name, teachers: [], room: 'K101', isRemote: false, credits: 2, badges: [],
})
const N1_PERIODS = [
  { period: 1, start: '09:00', end: '10:30' },
  { period: 2, start: '10:40', end: '12:10' },
  { period: 3, start: '13:00', end: '14:30' },
  { period: 4, start: '14:40', end: '16:10' },
]
/** 2026-09-14（月）08:00。 */
const MON_8 = new Date(2026, 8, 14, 8, 0, 0, 0)
const monCol = (slots: TimetableCollection['slots']): TimetableCollection => ({
  periodTimes: { campus: '野田', periods: N1_PERIODS },
  slots,
})
const noticesOn = (col: TimetableCollection, now = MON_8) =>
  upcomingAttendanceNotices(computeAttendanceAlarms([col], {}, startOfLocalDay(now), { daysAhead: 1 }), now)

describe('積みコマは同じ時刻の1枠にまとめる（N1 §4.1・T2/T3）', () => {
  const stacked = monCol([{ day: 'mon', period: 2, classes: [n1cls('Q1', '情報科学概論A'), n1cls('Q2', '情報科学概論B')] }])

  it('T2 陽性: 月2限に A・B → 開始1枠・終了前1枠。科目は2つとも残る', () => {
    const n = noticesOn(stacked)
    expect(n.map((x) => x.id)).toEqual(['att:s:20260914-1040', 'att:l:20260914-1200'])
    for (const x of n) {
      expect(x.courses).toEqual([
        { courseCode: 'Q1', courseName: '情報科学概論A' },
        { courseCode: 'Q2', courseName: '情報科学概論B' },
      ])
    }
    expect(n[0].span).toBe('10:40-12:10')
    expect(n[1].endsAt).toBe('12:10')
  })

  it('T2 陽性: まとめた後は20秒のずれが起きない（開始は 10:40:00 のまま）', () => {
    const s = staggerSameInstant(noticesOn(stacked), DEFAULT_STAGGER_STEP_MS, (x) => x.id)
    expect(s[0].fireAt).toBe(new Date(2026, 8, 14, 10, 40, 0).toISOString())
  })

  it('T2 陰性: 積んでいないコマは1科目の枠が今と同じ時刻に2つ', () => {
    const n = noticesOn(monCol([{ day: 'mon', period: 2, classes: [n1cls('C1', '線形代数1')] }]))
    expect(n.map((x) => [x.id, x.courses.length])).toEqual([
      ['att:s:20260914-1040', 1],
      ['att:l:20260914-1200', 1],
    ])
  })

  it('T3 長さの違う積みコマ（A＝3-4限、B＝3限）→ 開始1枠、終了前2枠（別の id）', () => {
    const n = noticesOn(
      monCol([
        { day: 'mon', period: 3, classes: [n1cls('X1', '化学実験'), n1cls('X2', '化学演習')] },
        { day: 'mon', period: 4, classes: [n1cls('X1', '化学実験')] },
      ]),
    )
    expect(n.map((x) => [x.id, x.courses.map((c) => c.courseCode).join(','), x.span])).toEqual([
      ['att:s:20260914-1300', 'X1,X2', '13:00-16:10'],
      ['att:l:20260914-1420', 'X2', '13:00-14:30'],
      ['att:l:20260914-1600', 'X1', '13:00-16:10'],
    ])
  })

  it('始まっている授業の終了前にも授業の時間帯（span）が付く（今日の0:00から計算する理由）', () => {
    const n = noticesOn(stacked, new Date(2026, 8, 14, 11, 0))
    expect(n).toHaveLength(1)
    expect(n[0]).toMatchObject({ id: 'att:l:20260914-1200', span: '10:40-12:10' })
  })
})

describe('N1 の小道具（§4.2・§4.3）', () => {
  it('attendanceNoticeId はローカル時刻の日付＋時分で、秒は落とす', () => {
    expect(attendanceNoticeId('attendance-start', new Date(2026, 8, 14, 9, 5, 20).toISOString())).toBe('att:s:20260914-0905')
    expect(attendanceNoticeId('attendance-last-chance', new Date(2026, 8, 14, 16, 0).toISOString())).toBe('att:l:20260914-1600')
  })

  it('isAttendanceNoticeId / isStartNoticeId（陰性: 旧版の uuid・受付open の identifier）', () => {
    expect(isAttendanceNoticeId('att:l:20260914-1600')).toBe(true)
    expect(isAttendanceNoticeId('3f2b9a1c-0000-4000-8000-000000000000')).toBe(false)
    expect(isAttendanceNoticeId('open:2026-09-14|線形代数1|10:40〜12:10')).toBe(false)
    expect(isStartNoticeId('att:s:20260914-1040')).toBe(true)
    expect(isStartNoticeId('att:l:20260914-1200')).toBe(false)
  })

  it('startOfLocalDay / spanMinutes', () => {
    expect(startOfLocalDay(new Date(2026, 8, 14, 23, 59))).toEqual(new Date(2026, 8, 14, 0, 0, 0, 0))
    expect(spanMinutes('10:40-12:10')).toEqual({ startMin: 640, endMin: 730 })
    expect(spanMinutes('壊れ')).toBeNull()
  })

  it('excludeNotices は id が一致する枠だけを落とす', () => {
    const n = noticesOn(monCol([{ day: 'mon', period: 2, classes: [n1cls('C1', '線形代数1')] }]))
    expect(excludeNotices(n, new Set(['att:s:20260914-1040'])).map((x) => x.id)).toEqual(['att:l:20260914-1200'])
  })

  it('todaySlotNotices は科目別OFF・休講・学期終了を通さない（照合は時間割にある全科目で行う）', () => {
    const col = monCol([{ day: 'mon', period: 1, classes: [n1cls('D1', '英語')] }])
    expect(computeAttendanceAlarms([col], { D1: false }, MON_8, { daysAhead: 1 })).toEqual([])
    expect(todaySlotNotices([col], MON_8).map((x) => x.id)).toEqual(['att:s:20260914-0900', 'att:l:20260914-1020'])
  })

  it('mergeAttendanceNotices は入力を壊さない', () => {
    const alarms = computeAttendanceAlarms(
      [monCol([{ day: 'mon', period: 2, classes: [n1cls('Q1', 'A'), n1cls('Q2', 'B')] }])],
      {},
      MON_8,
      { daysAhead: 1 },
    )
    const snap = JSON.parse(JSON.stringify(alarms))
    mergeAttendanceNotices(alarms)
    expect(alarms).toEqual(snap)
  })
})

describe('積みコマの題名（N1 §4.1・T2/T4/T5）', () => {
  const ctx = (over: Partial<NoticeTitleContext> = {}): NoticeTitleContext => ({
    overrides: {},
    manualQuarter: null,
    resolvedQuarter: 'first',
    ...over,
  })
  const A = { courseCode: 'Q1', courseName: '情報科学概論A' }
  const B = { courseCode: 'Q2', courseName: '情報科学概論B' }
  const notice = (courses: AttendanceNotice['courses'], kind: AttendanceNotice['kind'] = 'attendance-start'): AttendanceNotice =>
    kind === 'attendance-start'
      ? { id: 'att:s:20260914-1040', kind, fireAt: new Date(2026, 8, 14, 10, 40).toISOString(), date: '2026-09-14', span: '10:40-12:10', courses }
      : { id: 'att:l:20260914-1200', kind, fireAt: new Date(2026, 8, 14, 12, 0).toISOString(), endsAt: '12:10', date: '2026-09-14', span: '10:40-12:10', courses }

  it('T2: 指定が無ければ「A／B 出席コード」（本文は1科目の時と同じ）', () => {
    const c = buildAttendanceNoticeContent(notice([A, B]), ctx())
    expect(c.title).toBe('情報科学概論A／情報科学概論B 出席コード')
    expect(c.body).toBe('授業が始まりました。出席コードを入力できるか確認しましょう')
  })

  it('T2 陰性: 1科目の枠は既存の buildAttendanceNotificationContent と同じ文面（開始・終了前とも）', () => {
    for (const kind of ['attendance-start', 'attendance-last-chance'] as const) {
      const n = notice([A], kind)
      expect(buildAttendanceNoticeContent(n, ctx())).toEqual(
        buildAttendanceNotificationContent({
          kind, courseCode: 'Q1', courseName: '情報科学概論A', day: 'mon', period: 2, fireAt: n.fireAt, endsAt: n.endsAt,
        }),
      )
    }
  })

  it('T4 陽性: 手動の指定があり、全科目に半期が明示され、現在に一致するのが1科目 → その科目名だけ', () => {
    expect(
      noticeTitleName([A, B], ctx({ manualQuarter: 'second', resolvedQuarter: 'second', overrides: { Q1: { quarter: 'first' }, Q2: { quarter: 'second' } } })),
    ).toBe('情報科学概論B')
  })

  it('T4 陰性: 現在の半期が自動（null）なら絞らない（月の近似は使わない）', () => {
    expect(
      noticeTitleName([A, B], ctx({ manualQuarter: null, resolvedQuarter: 'second', overrides: { Q1: { quarter: 'first' }, Q2: { quarter: 'second' } } })),
    ).toBe('情報科学概論B／情報科学概論A')
  })

  it('T4 陰性: 1科目が未指定なら絞らない', () => {
    expect(
      noticeTitleName([A, B], ctx({ manualQuarter: 'second', resolvedQuarter: 'second', overrides: { Q2: { quarter: 'second' } } })),
    ).toBe('情報科学概論B／情報科学概論A')
  })

  it('T4 陰性: 両方が現在の半期なら絞らない', () => {
    expect(
      noticeTitleName([A, B], ctx({ manualQuarter: 'first', resolvedQuarter: 'first', overrides: { Q1: { quarter: 'first' }, Q2: { quarter: 'first' } } })),
    ).toBe('情報科学概論A／情報科学概論B')
  })

  it('T4 陰性: 両方が別の半期なら絞らない', () => {
    expect(
      noticeTitleName([A, B], ctx({ manualQuarter: 'first', resolvedQuarter: 'first', overrides: { Q1: { quarter: 'second' }, Q2: { quarter: 'second' } } })),
    ).toBe('情報科学概論A／情報科学概論B')
  })

  it('T4 並び: 現在の半期に一致 → 未指定 → 別の半期。同じ順位は科目コードの昇順', () => {
    const C = { courseCode: 'Q0', courseName: '情報科学概論C' }
    expect(
      noticeTitleName([A, B, C], ctx({ resolvedQuarter: 'first', overrides: { Q2: { quarter: 'first' }, Q1: { quarter: 'second' } } })),
    ).toBe('情報科学概論B／情報科学概論C／情報科学概論A')
  })

  it('T4: どの場合も枠は1つ（題名だけが変わる）', () => {
    const n = mergeAttendanceNotices(
      computeAttendanceAlarms(
        [monCol([{ day: 'mon', period: 2, classes: [n1cls('Q1', '情報科学概論A'), n1cls('Q2', '情報科学概論B')] }])],
        {},
        startOfLocalDay(MON_8),
        { daysAhead: 1 },
      ),
    )
    expect(n.filter((x) => x.kind === 'attendance-start')).toHaveLength(1)
    for (const c of [ctx(), ctx({ manualQuarter: 'first', overrides: { Q1: { quarter: 'first' }, Q2: { quarter: 'second' } } })]) {
      expect(buildAttendanceNoticeContent(n[0], c).title.endsWith(' 出席コード')).toBe(true)
    }
  })

  it('T5: 同名で別コード → 題名は1つの名前', () => {
    expect(noticeTitleName([{ courseCode: 'E1', courseName: '英語' }, { courseCode: 'E2', courseName: '英語' }], ctx())).toBe('英語')
  })
})
