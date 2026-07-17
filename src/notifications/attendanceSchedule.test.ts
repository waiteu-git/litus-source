import { computeAttendanceAlarms, buildAttendanceNotificationContent, consecutiveRuns } from './attendanceSchedule'
import type { TimetableCollection } from '../collect/timetableMessage'

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
  it('開始とラストチャンスで文面が変わる', () => {
    const base = { courseCode: '9973339', courseName: '基礎情報工学A', day: 'mon' as const, period: 3 }
    const start = buildAttendanceNotificationContent({ ...base, kind: 'attendance-start', fireAt: '' })
    const last = buildAttendanceNotificationContent({ ...base, kind: 'attendance-last-chance', fireAt: '' })
    expect(start.title).toContain('基礎情報工学A')
    expect(start.body).not.toEqual(last.body)
    expect(last.body).toContain('基礎情報工学A')
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
