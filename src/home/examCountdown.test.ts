import { describe, expect, it } from 'vitest'
import { buildExamCountdown, calendarDayDiff, countdownDaysLabel, countdownTone } from './examCountdown'
import type { ClassEvent, ClassEventType } from '../timetableEvents/classEvent'

const NOW = new Date(2026, 6, 13, 14, 0) // 2026-07-13(月) 14:00

function ev(over: Partial<ClassEvent> & { id: string; type: ClassEventType; date: string }): ClassEvent {
  return {
    courseName: '科目',
    courseCode: null,
    periods: [1],
    room: null,
    note: null,
    createdAt: '',
    ...over,
  }
}

describe('calendarDayDiff', () => {
  it('時刻でなく日付境界で数える（23:00→翌0:30は1日）', () => {
    expect(calendarDayDiff(new Date(2026, 6, 13, 23, 0), new Date(2026, 6, 14, 0, 30))).toBe(1)
  })
  it('同日は0・過去は負', () => {
    expect(calendarDayDiff(new Date(2026, 6, 13, 0, 1), new Date(2026, 6, 13, 23, 59))).toBe(0)
    expect(calendarDayDiff(NOW, new Date(2026, 6, 11, 9, 0))).toBe(-2)
  })
  it('月またぎ・DST非依存（UTC基準の日付差）', () => {
    expect(calendarDayDiff(new Date(2026, 6, 30, 22, 0), new Date(2026, 7, 2, 1, 0))).toBe(3)
  })
})

describe('countdownDaysLabel', () => {
  it('本日/明日/残りN日', () => {
    expect(countdownDaysLabel(0)).toBe('本日')
    expect(countdownDaysLabel(1)).toBe('明日')
    expect(countdownDaysLabel(3)).toBe('残り3日')
  })
})

describe('countdownTone', () => {
  it('本日=danger・3日以内=warn・それ以遠は無彩色', () => {
    expect(countdownTone(0)).toBe('red')
    expect(countdownTone(1)).toBe('amber')
    expect(countdownTone(3)).toBe('amber')
    expect(countdownTone(4)).toBe('gray')
  })
})

describe('buildExamCountdown', () => {
  it('対象0件なら空配列（カード非表示の判定に使う）', () => {
    expect(buildExamCountdown([], NOW)).toEqual([])
  })

  it('近い順に並べ、種別ラベル・時限/教室・日付を組み立てる', () => {
    const items = buildExamCountdown(
      [
        ev({ id: 'e2', type: 'final', date: '2026-07-30', courseName: '線形代数', periods: [3, 4], room: 'K101' }),
        ev({ id: 'e1', type: 'quiz', date: '2026-07-15', courseName: '微分積分学', periods: [2] }),
      ],
      NOW,
    )
    expect(items.map((i) => i.title)).toEqual(['微分積分学', '線形代数'])
    expect(items[0]).toMatchObject({
      eventId: 'e1',
      typeLabel: '小テスト',
      subtitle: '2限',
      dateLabel: '7/15',
      days: 2,
      daysLabel: '残り2日',
      tone: 'amber',
    })
    expect(items[1]).toMatchObject({ typeLabel: '期末', subtitle: '3・4限 ・ K101', dateLabel: '7/30' })
  })

  it('時限も教室も無ければ subtitle は null', () => {
    const items = buildExamCountdown([ev({ id: 'e1', type: 'midterm', date: '2026-07-15', periods: [] })], NOW)
    expect(items[0].subtitle).toBe(null)
  })

  it('既定は最大3件・limitで変えられる', () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      ev({ id: `e${i}`, type: 'quiz', date: `2026-07-2${i}`, courseName: `科目${i}` }),
    )
    expect(buildExamCountdown(events, NOW)).toHaveLength(3)
    expect(buildExamCountdown(events, NOW, 5)).toHaveLength(5)
    expect(buildExamCountdown(events, NOW, 0)).toEqual([])
  })

  it('当日を含む未来のみ・過去は出さない', () => {
    const items = buildExamCountdown(
      [
        ev({ id: 'past', type: 'final', date: '2026-07-12', courseName: '過去' }),
        ev({ id: 'today', type: 'final', date: '2026-07-13', courseName: '本日' }),
        ev({ id: 'tomorrow', type: 'quiz', date: '2026-07-14', courseName: '明日' }),
      ],
      NOW,
    )
    expect(items.map((i) => i.title)).toEqual(['本日', '明日'])
    expect(items.map((i) => i.daysLabel)).toEqual(['本日', '明日'])
    expect(items.map((i) => i.tone)).toEqual(['red', 'amber'])
  })

  it('quiz/midterm/final のみ（休講・補講・教室変更・その他は対象外）', () => {
    const items = buildExamCountdown(
      [
        ev({ id: 'c', type: 'cancel', date: '2026-07-15' }),
        ev({ id: 'm', type: 'makeup', date: '2026-07-15' }),
        ev({ id: 'r', type: 'roomChange', date: '2026-07-15' }),
        ev({ id: 'o', type: 'other', date: '2026-07-15' }),
        ev({ id: 'q', type: 'quiz', date: '2026-07-15', courseName: '小テスト科目' }),
      ],
      NOW,
    )
    expect(items.map((i) => i.title)).toEqual(['小テスト科目'])
  })

  it('同日複数は科目名順（決定論的）', () => {
    const items = buildExamCountdown(
      [
        ev({ id: 'e2', type: 'quiz', date: '2026-07-16', courseName: 'い科目' }),
        ev({ id: 'e3', type: 'final', date: '2026-07-16', courseName: 'あ科目' }),
        ev({ id: 'e1', type: 'midterm', date: '2026-07-15', courseName: 'う科目' }),
      ],
      NOW,
    )
    expect(items.map((i) => i.title)).toEqual(['う科目', 'あ科目', 'い科目'])
  })

  it('日付書式が壊れたイベントは落とす', () => {
    expect(buildExamCountdown([ev({ id: 'x', type: 'quiz', date: '2026/07/15' })], NOW)).toEqual([])
    expect(buildExamCountdown([ev({ id: 'x', type: 'quiz', date: '' })], NOW)).toEqual([])
    expect(buildExamCountdown([ev({ id: 'x', type: 'quiz', date: '2026-02-31' })], NOW)).toEqual([])
  })

  it('タップ着地に必要な情報を持つ（イベントID＋科目名＋科目コード）', () => {
    const items = buildExamCountdown(
      [ev({ id: 'evt_1', type: 'final', date: '2026-07-15', courseName: '線形代数', courseCode: 'C123' })],
      NOW,
    )
    expect(items[0]).toMatchObject({ eventId: 'evt_1', courseName: '線形代数', courseCode: 'C123' })
  })

  it('決定論的（同じ入力・同じ now で完全一致）・入力配列を破壊しない', () => {
    const events = [
      ev({ id: 'e2', type: 'quiz', date: '2026-07-30' }),
      ev({ id: 'e1', type: 'quiz', date: '2026-07-15' }),
    ]
    const before = events.map((e) => e.id)
    expect(buildExamCountdown(events, NOW)).toEqual(buildExamCountdown(events, NOW))
    expect(events.map((e) => e.id)).toEqual(before)
  })
})
