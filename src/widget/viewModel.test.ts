import { describe, expect, it } from 'vitest'
import { buildWidgetModel } from './viewModel'
import type { TimetableCollection } from '../collect/timetableMessage'
import type { Assignment } from '../storage/assignmentsSerialize'
import type { AttendedRecord } from '../attendance/attendedState'

// 2026-07-06 は月曜。時限時刻は CLASS 標準に寄せた例。
const MON = (h: number, m = 0) => new Date(2026, 6, 6, h, m)

const periodTimes = {
  campus: '葛飾',
  periods: [
    { period: 1, start: '09:00', end: '10:40' },
    { period: 2, start: '10:50', end: '12:30' },
    { period: 3, start: '13:00', end: '14:40' },
    { period: 4, start: '14:50', end: '16:30' },
    { period: 5, start: '16:40', end: '18:20' },
  ],
}

function cls(name: string, room = 'K404', isRemote = false) {
  return { courseCode: name, name, teachers: ['佐藤 健一'], room, isRemote, credits: null, badges: [] }
}

function collection(slots: TimetableCollection['slots']): TimetableCollection[] {
  return [{ slots, periodTimes }]
}

function assignment(over: Partial<Assignment>): Assignment {
  return {
    url: 'https://letus.example/mod/assign/1',
    courseCode: null,
    courseName: '線形代数',
    title: 'レポート1',
    deadline: null,
    deadlineText: '',
    submissionStatus: 'not_submitted',
    lifecycleStatus: 'active',
    ignored: false,
    firstSeenAt: '2026-07-01T00:00:00.000Z',
    lastSeenAt: '2026-07-06T00:00:00.000Z',
    lastCheckedAt: '2026-07-06T00:00:00.000Z',
    ...over,
  }
}

describe('buildWidgetModel', () => {
  it('データが空なら nextClass/nearestAssignment は null・later は空・attendance は idle', () => {
    const m = buildWidgetModel(MON(8, 0), [], [], null)
    expect(m.nextClass).toBeNull()
    expect(m.laterClasses).toEqual([])
    expect(m.nearestAssignment).toBeNull()
    expect(m.attendance).toEqual({ state: 'idle', targetCourse: null })
  })

  it('todayLabel と updatedAtLabel を整形する', () => {
    const m = buildWidgetModel(MON(8, 5), [], [], null)
    expect(m.todayLabel).toBe('7/6（月）')
    expect(m.updatedAtLabel).toBe('8:05時点')
  })

  it('開始前は次の授業を minutesUntil 付きで返す（進行中でないので分数あり）', () => {
    const cols = collection([{ day: 'mon', period: 3, classes: [cls('情報理論', 'K301')] }])
    const m = buildWidgetModel(MON(12, 30), cols, [], null)
    expect(m.nextClass).toEqual({
      name: '情報理論',
      period: 3,
      startText: '13:00',
      room: 'K301',
      isRemote: false,
      minutesUntil: 30,
    })
    expect(m.laterClasses).toEqual([])
  })

  it('進行中の授業は minutesUntil=null・後続コマを laterClasses に入れる', () => {
    const cols = collection([
      { day: 'mon', period: 3, classes: [cls('情報理論')] },
      { day: 'mon', period: 4, classes: [cls('統計学')] },
      { day: 'mon', period: 5, classes: [cls('英語')] },
    ])
    const m = buildWidgetModel(MON(13, 30), cols, [], null)
    expect(m.nextClass!.name).toBe('情報理論')
    expect(m.nextClass!.minutesUntil).toBeNull()
    expect(m.laterClasses.map((c) => c.name)).toEqual(['統計学', '英語'])
  })

  it('laterClasses は最大2件・focus より後のコマのみ', () => {
    const cols = collection([
      { day: 'mon', period: 2, classes: [cls('A')] },
      { day: 'mon', period: 3, classes: [cls('B')] },
      { day: 'mon', period: 4, classes: [cls('C')] },
      { day: 'mon', period: 5, classes: [cls('D')] },
    ])
    // 8:00 = 全て開始前。focus は period2(A)。later は B,C（最大2）。
    const m = buildWidgetModel(MON(8, 0), cols, [], null)
    expect(m.nextClass!.name).toBe('A')
    expect(m.laterClasses.map((c) => c.name)).toEqual(['B', 'C'])
  })

  it('隔週で今週休みの授業(isOn=false)は次の授業判定から除外', () => {
    const cols = collection([
      { day: 'mon', period: 2, classes: [cls('隔週ゼミ')] },
      { day: 'mon', period: 4, classes: [cls('統計学')] },
    ])
    const m = buildWidgetModel(MON(8, 0), cols, [], null, (code) => code !== '隔週ゼミ')
    expect(m.nextClass!.name).toBe('統計学')
    expect(m.laterClasses).toEqual([])
  })

  it('遠隔フラグを引き継ぐ', () => {
    const cols = collection([{ day: 'mon', period: 3, classes: [cls('遠隔講義', 'オンライン', true)] }])
    const m = buildWidgetModel(MON(12, 0), cols, [], null)
    expect(m.nextClass!.isRemote).toBe(true)
  })

  it('直近の未提出課題を relDue テキスト・urgent 付きで返す', () => {
    // now=MON 12:00。24h 以内(=urgent red)の締切。
    const soon = new Date(2026, 6, 6, 20, 0).toISOString()
    const later = new Date(2026, 6, 10, 12, 0).toISOString()
    const list = [
      assignment({ url: 'u2', title: '遠い', deadline: later }),
      assignment({ url: 'u1', title: '近い', courseName: '物理', deadline: soon }),
    ]
    const m = buildWidgetModel(MON(12, 0), [], list, null)
    expect(m.nearestAssignment).toEqual({
      courseName: '物理',
      title: '近い',
      deadlineText: 'あと8時間',
      urgent: true,
      url: 'u1',
    })
  })

  it('提出済みの課題は nearestAssignment に出さない', () => {
    const soon = new Date(2026, 6, 6, 20, 0).toISOString()
    const list = [assignment({ deadline: soon, submissionStatus: 'submitted' })]
    const m = buildWidgetModel(MON(12, 0), [], list, null)
    expect(m.nearestAssignment).toBeNull()
  })

  it('授業時間帯なら attendance.state=open・対象科目名を返す', () => {
    const cols = collection([{ day: 'mon', period: 3, classes: [cls('情報理論')] }])
    const m = buildWidgetModel(MON(13, 30), cols, [], null)
    expect(m.attendance.state).toBe('open')
    expect(m.attendance.targetCourse).toBe('情報理論')
  })

  it('本日その授業に出席済みなら attendance.state=done', () => {
    const cols = collection([{ day: 'mon', period: 3, classes: [cls('情報理論')] }])
    const attended: AttendedRecord = {
      date: '2026-07-06',
      courseName: '情報理論',
      confirmWindow: '13:00〜14:40',
      code: '1234',
    }
    const m = buildWidgetModel(MON(13, 30), cols, [], attended)
    expect(m.attendance.state).toBe('done')
    expect(m.attendance.targetCourse).toBe('情報理論')
  })
})
