import { describe, expect, it } from 'vitest'
import { buildExamCountdown, calendarDayDiff, countdownDaysLabel, countdownTone } from './examCountdown'
import type { ClassEvent, ClassEventType } from '../timetableEvents/classEvent'
import type { CampusPeriodTimes } from '../parsers/timetable'
import type { CountdownStart } from '../timetableEvents/classEvent'
import { buildDemoClassEvents } from '../demo/demoFixtures'

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

  describe('当日の時限終了判定（periodTimes を渡した場合）', () => {
    const PT: CampusPeriodTimes = {
      campus: '野田',
      periods: [
        { period: 1, start: '09:00', end: '10:30' },
        { period: 2, start: '10:45', end: '12:15' },
        { period: 3, start: '13:10', end: '14:40' },
        { period: 4, start: '14:55', end: '16:25' },
      ],
    }
    const today = (o: Partial<ClassEvent> = {}) =>
      ev({ id: 'e1', type: 'final', date: '2026-07-13', courseName: '本日の試験', periods: [3], ...o })

    it('当日・時限終了前なら残る（「本日」のまま）', () => {
      // 3限は 13:10-14:40。now=14:00 は終了前。
      const items = buildExamCountdown([today()], new Date(2026, 6, 13, 14, 0), 3, PT)
      expect(items.map((i) => i.title)).toEqual(['本日の試験'])
      expect(items[0]).toMatchObject({ daysLabel: '本日', tone: 'red' })
    })

    it('終了時刻ちょうどはまだ残る（過ぎてから消す）', () => {
      const items = buildExamCountdown([today()], new Date(2026, 6, 13, 14, 40), 3, PT)
      expect(items).toHaveLength(1)
    })

    it('当日・時限終了後は消える', () => {
      expect(buildExamCountdown([today()], new Date(2026, 6, 13, 14, 41), 3, PT)).toEqual([])
      expect(buildExamCountdown([today()], new Date(2026, 6, 13, 23, 59), 3, PT)).toEqual([])
    })

    it('複数時限は最も遅い終了時刻で判定する', () => {
      const e = today({ periods: [1, 4] })
      // 1限(〜10:30)は終わっているが4限(〜16:25)が残っている。
      expect(buildExamCountdown([e], new Date(2026, 6, 13, 12, 0), 3, PT)).toHaveLength(1)
      expect(buildExamCountdown([e], new Date(2026, 6, 13, 16, 25), 3, PT)).toHaveLength(1)
      expect(buildExamCountdown([e], new Date(2026, 6, 13, 16, 26), 3, PT)).toEqual([])
    })

    it('periodTimes を渡さなければ従来どおり日付のみ（当日は終日残る）', () => {
      expect(buildExamCountdown([today()], new Date(2026, 6, 13, 23, 59))).toHaveLength(1)
      expect(buildExamCountdown([today()], new Date(2026, 6, 13, 23, 59), 3, null)).toHaveLength(1)
    })

    it('時限未設定・periodTimes で引けない時限は日付のみで判定（安全側で当日いっぱい残す）', () => {
      expect(buildExamCountdown([today({ periods: [] })], new Date(2026, 6, 13, 23, 59), 3, PT)).toHaveLength(1)
      expect(buildExamCountdown([today({ periods: [9] })], new Date(2026, 6, 13, 23, 59), 3, PT)).toHaveLength(1)
      // 一部でも引けない時限があれば日付のみへフォールバック（引ける分だけで早く消さない）。
      expect(buildExamCountdown([today({ periods: [1, 9] })], new Date(2026, 6, 13, 23, 59), 3, PT)).toHaveLength(1)
    })

    it('時刻書式が壊れた periodTimes は日付のみへフォールバック', () => {
      const broken: CampusPeriodTimes = { campus: '野田', periods: [{ period: 3, start: '13:10', end: '午後' }] }
      expect(buildExamCountdown([today()], new Date(2026, 6, 13, 23, 59), 3, broken)).toHaveLength(1)
    })

    it('未来日は時刻に関係なく残る・過去日は時刻に関係なく消える', () => {
      const future = ev({ id: 'f', type: 'final', date: '2026-07-14', periods: [1], courseName: '明日' })
      const past = ev({ id: 'p', type: 'final', date: '2026-07-12', periods: [4], courseName: '昨日' })
      const items = buildExamCountdown([future, past], new Date(2026, 6, 13, 23, 59), 3, PT)
      expect(items.map((i) => i.title)).toEqual(['明日'])
      expect(buildExamCountdown([future, past], new Date(2026, 6, 13, 0, 1), 3, PT).map((i) => i.title)).toEqual(['明日'])
    })
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

describe('表示開始（startSetting と試験ごとの countdownStart・設計 A §4-2・§7-2A）', () => {
  const EXAM = (o: Partial<ClassEvent> = {}) =>
    ev({ id: 'x', type: 'final', date: '2026-07-20', courseName: '試験', ...o })

  it('境界: 全体7日前・試験日7/20で、7/12 23:59（8日前）には出ない／7/13 0:00（7日前）に「残り7日」で出る', () => {
    expect(buildExamCountdown([EXAM()], new Date(2026, 6, 12, 23, 59), 3, null, 7)).toEqual([])
    const items = buildExamCountdown([EXAM()], new Date(2026, 6, 13, 0, 0), 3, null, 7)
    expect(items.map((i) => i.daysLabel)).toEqual(['残り7日'])
  })

  it('always を渡した結果は、引数を省いた結果と一致する（既定＝今と同じ）', () => {
    const events = [
      EXAM({ id: 'a', date: '2026-07-14', courseName: 'A' }),
      EXAM({ id: 'b', date: '2026-08-10', courseName: 'B' }),
      EXAM({ id: 'c', date: '2026-09-30', courseName: 'C' }),
      EXAM({ id: 'd', date: '2026-10-30', courseName: 'D' }),
    ]
    const omitted = buildExamCountdown(events, NOW)
    expect(buildExamCountdown(events, NOW, 3, null, 'always')).toEqual(omitted)
    expect(omitted.map((i) => i.title)).toEqual(['A', 'B', 'C'])
    // 陰性対照: 全体7なら結果が変わる（この入力で表示開始が実際に効くことの確認）
    expect(buildExamCountdown(events, NOW, 3, null, 7).map((i) => i.title)).toEqual(['A'])
  })

  it('試験ごとの N日前 は全体に勝つ: 全体 always に試験7で、8日前は出ない／7日前は出る', () => {
    const e = EXAM({ countdownStart: { kind: 'days', days: 7 } })
    expect(buildExamCountdown([e], new Date(2026, 6, 12, 12, 0), 3, null, 'always')).toEqual([])
    expect(buildExamCountdown([e], new Date(2026, 6, 13, 0, 0), 3, null, 'always')).toHaveLength(1)
  })

  it('試験ごとの N日前 は全体に勝つ: 全体7に試験30で、20日前に出る（上書きの無い試験は出ない＝対照）', () => {
    const now = new Date(2026, 5, 30, 12, 0) // 6/30＝7/20 の20日前
    const items = buildExamCountdown(
      [
        EXAM({ id: 'o', courseName: '上書き30', countdownStart: { kind: 'days', days: 30 } }),
        EXAM({ id: 'p', courseName: '上書きなし' }),
      ],
      now,
      3,
      null,
      7,
    )
    expect(items.map((i) => i.title)).toEqual(['上書き30'])
    expect(items[0].daysLabel).toBe('残り20日')
  })

  it('日時を指定: 開始1分前は出ない／ちょうどで出る（全体 always より試験ごとが勝つ）', () => {
    const e = EXAM({ countdownStart: { kind: 'at', date: '2026-07-15', time: '09:00' } })
    expect(buildExamCountdown([e], new Date(2026, 6, 15, 8, 59), 3, null, 'always')).toEqual([])
    expect(buildExamCountdown([e], new Date(2026, 6, 15, 9, 0), 3, null, 'always')).toHaveLength(1)
  })

  it('日時を指定: 試験当日の朝を開始にすると、開始から時限の終了まで出る', () => {
    const PT: CampusPeriodTimes = { campus: '野田', periods: [{ period: 3, start: '13:10', end: '14:40' }] }
    const e = EXAM({ date: '2026-07-13', periods: [3], countdownStart: { kind: 'at', date: '2026-07-13', time: '09:00' } })
    expect(buildExamCountdown([e], new Date(2026, 6, 13, 8, 59), 3, PT)).toEqual([])
    expect(buildExamCountdown([e], new Date(2026, 6, 13, 9, 0), 3, PT)).toHaveLength(1)
    expect(buildExamCountdown([e], new Date(2026, 6, 13, 14, 40), 3, PT)).toHaveLength(1)
    expect(buildExamCountdown([e], new Date(2026, 6, 13, 14, 41), 3, PT)).toEqual([])
  })

  it('🔴 3件に切る前に落とす: 最も近い1件が開始前でも、残りの3件が出る（2件にならない）', () => {
    const later = [
      EXAM({ id: 'b', date: '2026-07-19', courseName: 'B' }),
      EXAM({ id: 'c', date: '2026-07-20', courseName: 'C' }),
      EXAM({ id: 'd', date: '2026-07-21', courseName: 'D' }),
    ]
    const aNotYet = EXAM({ id: 'a', date: '2026-07-18', courseName: 'A', countdownStart: { kind: 'at', date: '2026-07-18', time: '08:00' } })
    const aPlain = EXAM({ id: 'a', date: '2026-07-18', courseName: 'A' })
    expect(buildExamCountdown([aNotYet, ...later], NOW).map((i) => i.title)).toEqual(['B', 'C', 'D'])
    // 対照: A の上書きが無ければ A が先頭に入る（上の結果は表示開始が効いたせい）
    expect(buildExamCountdown([aPlain, ...later], NOW).map((i) => i.title)).toEqual(['A', 'B', 'C'])
  })

  it('日時を指定が試験日より後（壊れた値）なら全体の設定で判定する（永久に消えない）', () => {
    const e = EXAM({ countdownStart: { kind: 'at', date: '2026-07-25', time: '00:00' } })
    expect(buildExamCountdown([e], NOW, 3, null, 'always')).toHaveLength(1) // NOW=7/13: 全体 always なら出る
    expect(buildExamCountdown([e], new Date(2026, 6, 12, 12, 0), 3, null, 7)).toEqual([]) // 8日前・全体7
    expect(buildExamCountdown([e], NOW, 3, null, 7)).toHaveLength(1) // 7日前・全体7
  })

  it('日時を指定の日付・時刻が壊れていても全体の設定で判定する', () => {
    const broken: CountdownStart[] = [
      { kind: 'at', date: '2026-02-31', time: '09:00' },
      { kind: 'at', date: '2026-07-15', time: '24:00' },
      { kind: 'at', date: '2026-07-15', time: '9:00' },
    ]
    for (const cs of broken) {
      expect(buildExamCountdown([EXAM({ countdownStart: cs })], NOW, 3, null, 'always')).toHaveLength(1)
    }
  })

  it('試験以外の種類は、countdownStart を持っていても出ない（今と同じ）', () => {
    const e = ev({ id: 'c', type: 'cancel', date: '2026-07-15', countdownStart: { kind: 'days', days: 60 } })
    expect(buildExamCountdown([e], NOW, 3, null, 'always')).toEqual([])
  })

  it('デモ: 既定（always）なら中間（demo-event-3・14〜20日先）が出る／全体7なら出ない（曜日を変えて7通り）', () => {
    for (let d = 13; d <= 19; d++) {
      // 2026-07-13(月)〜07-19(日)
      const now = new Date(2026, 6, d, 10, 0)
      const events = buildDemoClassEvents(now)
      expect(buildExamCountdown(events, now).map((i) => i.eventId)).toEqual(['demo-event-3'])
      expect(buildExamCountdown(events, now, 3, null, 'always').map((i) => i.eventId)).toEqual(['demo-event-3'])
      expect(buildExamCountdown(events, now, 3, null, 7)).toEqual([])
    }
  })
})
