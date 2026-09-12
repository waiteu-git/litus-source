import { describe, it, expect } from 'vitest'
import {
  attendanceOpenKey,
  shouldNotifyAttendanceOpen,
  buildAttendanceOpenContent,
  pruneNotifiedAttendanceKeys,
  courseCodeByName,
} from './attendanceOpenNotify'
import {
  addAnnouncedSlotId,
  claimAttendanceOpen,
  collectExcludedIds,
  deliveredAtMs,
  matchAttendedSlots,
  matchOpenSlot,
  shouldReplaceQuietly,
  QUIET_MS,
} from './attendanceOpenNotify'
import { computeAttendanceAlarms, excludeNotices, startOfLocalDay, todaySlotNotices, upcomingAttendanceNotices } from './attendanceSchedule'
import { createWriteQueue } from '../storage/writeQueue'
import type { TimetableCollection } from '../collect/timetableMessage'
import type { AttendedRecord } from '../attendance/attendedState'

const NOW = new Date('2026-07-13T10:40:00+09:00') // ローカル(JST)で2026-07-13

describe('attendanceOpenKey', () => {
  it('当日キー＋科目名＋受付時間で dedup キーを作る', () => {
    expect(
      attendanceOpenKey({ courseName: '線形代数学1', confirmWindow: '10:40〜10:50', now: NOW }),
    ).toBe('2026-07-13|線形代数学1|10:40〜10:50')
  })

  it('科目名 null は ? にフォールバック', () => {
    expect(attendanceOpenKey({ courseName: null, confirmWindow: '10:40〜10:50', now: NOW })).toBe(
      '2026-07-13|?|10:40〜10:50',
    )
  })

  it('受付時間 null は ? にフォールバック', () => {
    expect(attendanceOpenKey({ courseName: '線形代数学1', confirmWindow: null, now: NOW })).toBe(
      '2026-07-13|線形代数学1|?',
    )
  })

  it('同日でも confirmWindow が異なれば別キー（再受付で再通知される）', () => {
    const a = attendanceOpenKey({ courseName: '英語', confirmWindow: '10:40〜10:50', now: NOW })
    const b = attendanceOpenKey({ courseName: '英語', confirmWindow: '13:00〜13:10', now: NOW })
    expect(a).not.toBe(b)
  })
})

describe('shouldNotifyAttendanceOpen', () => {
  const base = {
    status: 'accepting' as const,
    attendedNow: false,
    attendanceFocused: false,
    key: '2026-07-13|線形代数学1|10:40〜10:50',
    notifiedKeys: [] as string[],
  }

  it('受付中・未出席・フォーカス外・未通知なら true', () => {
    expect(shouldNotifyAttendanceOpen(base)).toBe(true)
  })

  it('status が accepting 以外なら false', () => {
    expect(shouldNotifyAttendanceOpen({ ...base, status: 'closed' })).toBe(false)
    expect(shouldNotifyAttendanceOpen({ ...base, status: 'none' })).toBe(false)
    expect(shouldNotifyAttendanceOpen({ ...base, status: 'attended' })).toBe(false)
    expect(shouldNotifyAttendanceOpen({ ...base, status: 'unknown' })).toBe(false)
  })

  it('既に出席済み(attendedNow)なら false', () => {
    expect(shouldNotifyAttendanceOpen({ ...base, attendedNow: true })).toBe(false)
  })

  it('出席画面フォーカス中なら false（バナーで足りる）', () => {
    expect(shouldNotifyAttendanceOpen({ ...base, attendanceFocused: true })).toBe(false)
  })

  it('同一キーが通知済みなら false（重複通知防止）', () => {
    expect(shouldNotifyAttendanceOpen({ ...base, notifiedKeys: [base.key] })).toBe(false)
  })

  it('別キーが通知済みでも当該キー未通知なら true', () => {
    expect(shouldNotifyAttendanceOpen({ ...base, notifiedKeys: ['2026-07-13|別科目|9:00〜9:10'] })).toBe(true)
  })
})

describe('buildAttendanceOpenContent', () => {
  it('科目・範囲ともあり', () => {
    expect(buildAttendanceOpenContent({ courseName: '線形代数学1', confirmWindow: '10:40〜10:50' })).toEqual({
      title: '出席受付が始まりました',
      body: '「線形代数学1」の出席受付中（10:40〜10:50）。タップして出席登録',
    })
  })

  it('科目 null（範囲あり）', () => {
    expect(buildAttendanceOpenContent({ courseName: null, confirmWindow: '10:40〜10:50' })).toEqual({
      title: '出席受付が始まりました',
      body: '出席受付が開いています（10:40〜10:50）。タップして出席登録',
    })
  })

  it('範囲 null（科目あり）は括弧を省略', () => {
    expect(buildAttendanceOpenContent({ courseName: '線形代数学1', confirmWindow: null })).toEqual({
      title: '出席受付が始まりました',
      body: '「線形代数学1」の出席受付中。タップして出席登録',
    })
  })

  it('両方 null', () => {
    expect(buildAttendanceOpenContent({ courseName: null, confirmWindow: null })).toEqual({
      title: '出席受付が始まりました',
      body: '出席受付が開いています。タップして出席登録',
    })
  })
})

describe('pruneNotifiedAttendanceKeys', () => {
  it('当日以外のキーを削除する', () => {
    const keys = ['2026-07-12|A|9:00〜9:10', '2026-07-13|B|10:40〜10:50', '2026-07-13|C|13:00〜13:10']
    expect(pruneNotifiedAttendanceKeys(keys, '2026-07-13')).toEqual([
      '2026-07-13|B|10:40〜10:50',
      '2026-07-13|C|13:00〜13:10',
    ])
  })

  it('当日キーは保持する', () => {
    const keys = ['2026-07-13|A|9:00〜9:10']
    expect(pruneNotifiedAttendanceKeys(keys, '2026-07-13')).toEqual(keys)
  })

  it('空配列はそのまま', () => {
    expect(pruneNotifiedAttendanceKeys([], '2026-07-13')).toEqual([])
  })
})


describe('科目別OFFを受付open通知にも効かせる', () => {
  // 修正前は科目別OFFが**予約型アラームにしか効かず**、OFFにした科目の受付open通知が
  // MAXチャンネル（音＋ヘッドアップ）で届いていた＝アプリ内に止める手段が無かった。
  const ok = {
    status: 'accepting' as const,
    attendedNow: false,
    attendanceFocused: false,
    key: '2026-07-17|物理学実験Ａ|14:40〜16:10',
    notifiedKeys: [] as string[],
  }

  it('OFFにした科目は通知しない', () => {
    expect(shouldNotifyAttendanceOpen({ ...ok, courseDisabled: true })).toBe(false)
  })

  it('ONの科目はこれまで通り通知する', () => {
    expect(shouldNotifyAttendanceOpen({ ...ok, courseDisabled: false })).toBe(true)
  })

  it('指定が無ければ通知する（後方互換・黙って殺さない）', () => {
    expect(shouldNotifyAttendanceOpen(ok)).toBe(true)
    expect(shouldNotifyAttendanceOpen({ ...ok, courseDisabled: undefined })).toBe(true)
  })
})

describe('courseCodeByName（設定の courseCode 鍵と受付の科目名を橋渡し）', () => {
  const col = (classes: { courseCode: string; name: string }[]) => ({ slots: [{ classes }] })

  it('科目名からcourseCodeを引く', () => {
    const cols = [col([{ courseCode: '9973344', name: '物理学実験Ａ' }])]
    expect(courseCodeByName(cols, '物理学実験Ａ')).toBe('9973344')
  })

  it('複数コレクション・複数slotを横断して引く', () => {
    const cols = [
      col([{ courseCode: 'A', name: '英語' }]),
      col([{ courseCode: 'B', name: '物理' }]),
    ]
    expect(courseCodeByName(cols, '物理')).toBe('B')
  })

  it('引けなければ null（＝呼び出し側は通知する側に倒す）', () => {
    const cols = [col([{ courseCode: 'A', name: '英語' }])]
    expect(courseCodeByName(cols, '物理学実験Ａ')).toBeNull()
    expect(courseCodeByName(cols, null)).toBeNull()
    expect(courseCodeByName([], '英語')).toBeNull()
  })

  it('表記が少しでも違えば引かない（誤った科目のOFFを適用しない）', () => {
    const cols = [col([{ courseCode: 'A', name: '基礎電気数学及び演習 （１組）' }])]
    // 全角/半角・空白の揺れは一致させない＝失敗の向きは「余分に鳴る」側で安全
    expect(courseCodeByName(cols, '基礎電気数学及び演習（1組）')).toBeNull()
  })
})

// ---- N1（2026-09-12）: 受付open・出席済みの照合（設計 §4.3・§4.4・§7-T9〜T13） ----
const n1cls = (courseCode: string, name: string) => ({
  courseCode, name, teachers: [], room: 'K101', isRemote: false, credits: 2, badges: [],
})
const N1_PERIODS = [
  { period: 1, start: '09:00', end: '10:30' },
  { period: 2, start: '10:40', end: '12:10' },
  { period: 3, start: '13:00', end: '14:30' },
  { period: 4, start: '14:40', end: '16:10' },
]
const n1col = (slots: TimetableCollection['slots'], periods = N1_PERIODS): TimetableCollection => ({
  periodTimes: { campus: '野田', periods },
  slots,
})
/** 2026-09-14 は月曜。 */
const MON = (h: number, m: number, s = 0) => new Date(2026, 8, 14, h, m, s)
const LINALG_MON2 = n1col([{ day: 'mon', period: 2, classes: [n1cls('C1', '線形代数1')] }])

describe('T9 claimAttendanceOpen（提示の前に同じ mutate の中で登録する＝H3）', () => {
  const input = {
    status: 'accepting' as const,
    attendedNow: false,
    attendanceFocused: false,
    key: '2026-09-14|線形代数1|10:40〜12:10',
    courseDisabled: false,
    today: '2026-09-14',
  }

  it('同じ入力で2回呼ぶと、1回目だけが claimed', () => {
    const first = claimAttendanceOpen([], input)
    const second = claimAttendanceOpen(first.next, input)
    expect([first.claimed, second.claimed]).toEqual([true, false])
    expect(first.next).toEqual([input.key])
  })

  it('登録の時に当日以外のキーを捨てる', () => {
    expect(claimAttendanceOpen(['2026-09-13|英語|9:00〜9:10'], input).next).toEqual([input.key])
  })

  it('通知しない条件（フォーカス中・科目別OFF・出席済み）では claimed にならず、キーも足さない', () => {
    for (const over of [{ attendanceFocused: true }, { courseDisabled: true }, { attendedNow: true }]) {
      expect(claimAttendanceOpen([], { ...input, ...over })).toEqual({ next: [], claimed: false })
    }
  })

  it('直列キューとメモリ上のストアで2つを同時に投げても、claimed は1つだけ', async () => {
    const q = createWriteQueue()
    let stored: string[] = []
    let claims = 0
    const mutate = (m: (k: string[]) => string[]) => q(async () => (stored = m(stored)))
    await Promise.all(
      [0, 1].map(() =>
        mutate((ks) => {
          const r = claimAttendanceOpen(ks, input)
          if (r.claimed) claims++
          return r.next
        }),
      ),
    )
    expect(claims).toBe(1)
    expect(stored).toEqual([input.key])
  })
})

describe('T10 M1 受付open → コマ', () => {
  it('窓の境界: 開始−5分ちょうど・終了ちょうどは当たり、その外は当たらない', () => {
    const n = todaySlotNotices([LINALG_MON2], MON(8, 0))
    expect(matchOpenSlot(n, '線形代数1', MON(10, 35, 0))).toBe('att:s:20260914-1040')
    expect(matchOpenSlot(n, '線形代数1', MON(10, 34, 59))).toBeNull()
    expect(matchOpenSlot(n, '線形代数1', MON(12, 10, 59))).toBe('att:s:20260914-1040')
    expect(matchOpenSlot(n, '線形代数1', MON(12, 11, 0))).toBeNull()
  })

  it('名前は完全一致だけ（表記ゆれ・null → null＝今と同じ動きに落ちる）', () => {
    const n = todaySlotNotices([LINALG_MON2], MON(8, 0))
    expect(matchOpenSlot(n, '線形代数１', MON(10, 45))).toBeNull()
    expect(matchOpenSlot(n, null, MON(10, 45))).toBeNull()
  })

  it('2つの枠に当たる → null（何も取り消さない）', () => {
    const tt = n1col(
      [
        { day: 'mon', period: 1, classes: [n1cls('E1', '英語')] },
        { day: 'mon', period: 2, classes: [n1cls('E2', '英語')] },
      ],
      [{ period: 1, start: '09:00', end: '10:30' }, { period: 2, start: '10:30', end: '12:00' }],
    )
    expect(matchOpenSlot(todaySlotNotices([tt], MON(8, 0)), '英語', MON(10, 28))).toBeNull()
  })

  it('同名で別コードの積みコマ → まとめた枠', () => {
    const tt = n1col([{ day: 'mon', period: 2, classes: [n1cls('Q1', '情報科学概論'), n1cls('Q2', '情報科学概論')] }])
    expect(matchOpenSlot(todaySlotNotices([tt], MON(8, 0)), '情報科学概論', MON(10, 45))).toBe('att:s:20260914-1040')
  })

  it('終了前の枠には当てない（開始の枠だけ）', () => {
    const n = todaySlotNotices([LINALG_MON2], MON(8, 0)).filter((x) => x.kind === 'attendance-last-chance')
    expect(matchOpenSlot(n, '線形代数1', MON(12, 0))).toBeNull()
  })
})

describe('T11 音なしで置き換えるか（配信時刻の単位を揃える）', () => {
  const X = 'att:s:20260914-1040'
  const d = MON(10, 40).getTime()
  const start = (date: number, data: Record<string, unknown> = { tag: 'attendance-alarm', kind: 'attendance-start' }) => ({
    identifier: X,
    date,
    data,
  })

  it('配信済みの X が3分以内 → 音なし（Android 形＝ミリ秒）。3分ちょうどまで', () => {
    expect(shouldReplaceQuietly([start(d)], X, d + 60_000)).toBe(true)
    expect(shouldReplaceQuietly([start(d)], X, d + QUIET_MS)).toBe(true)
  })

  it('3分を超える → 通常', () => {
    expect(shouldReplaceQuietly([start(d)], X, d + QUIET_MS + 1)).toBe(false)
  })

  it('同じ時刻を iOS 形（秒）で与えても同じ判定', () => {
    expect(shouldReplaceQuietly([start(d / 1000)], X, d + 60_000)).toBe(true)
    expect(shouldReplaceQuietly([start(d / 1000)], X, d + QUIET_MS + 1000)).toBe(false)
  })

  it('X が受付open（タグ違い）・終了前・配信済みが無い → 通常', () => {
    expect(shouldReplaceQuietly([start(d, { tag: 'attendance-open' })], X, d + 60_000)).toBe(false)
    expect(shouldReplaceQuietly([start(d, { tag: 'attendance-alarm', kind: 'attendance-last-chance' })], X, d + 60_000)).toBe(false)
    expect(shouldReplaceQuietly([], X, d + 60_000)).toBe(false)
  })

  it('deliveredAtMs は秒とミリ秒の両方を ms に揃える', () => {
    expect(deliveredAtMs(1789356000)).toBe(1789356000000)
    expect(deliveredAtMs(1789356000000)).toBe(1789356000000)
  })
})

describe('T12 除外 M4（受付open 済みのコマ）', () => {
  it('受付open 済みの X → 開始だけが消え、終了前と翌日・翌週の同じ時刻は残る', () => {
    const now = MON(8, 0)
    // 月2限と火2限に同じ科目（設計 T12 の「翌日の同じ時刻」＝火 10:40 の枠がある）。
    const MON_TUE2 = n1col([
      { day: 'mon', period: 2, classes: [n1cls('C1', '線形代数1')] },
      { day: 'tue', period: 2, classes: [n1cls('C1', '線形代数1')] },
    ])
    const notices = upcomingAttendanceNotices(
      computeAttendanceAlarms([MON_TUE2], {}, startOfLocalDay(now), { daysAhead: 8 }),
      now,
    )
    const excluded = collectExcludedIds({
      announced: ['att:s:20260914-1040'],
      attendedRec: null,
      retracted: [],
      todayNotices: todaySlotNotices([MON_TUE2], now),
      today: '2026-09-14',
    })
    expect(excludeNotices(notices, excluded).map((n) => n.id)).toEqual([
      'att:l:20260914-1200',
      'att:s:20260915-1040',
      'att:l:20260915-1200',
      'att:s:20260921-1040',
      'att:l:20260921-1200',
    ])
  })

  it('受付open 済みの記録に終了前の id や前日の id が紛れても除外しない（M4 は当日の開始だけ）', () => {
    const ex = collectExcludedIds({
      announced: ['att:l:20260914-1200', 'att:s:20260913-1040'],
      attendedRec: null,
      retracted: [],
      todayNotices: [],
      today: '2026-09-14',
    })
    expect(ex.size).toBe(0)
  })

  it('M5: 出席済みで当たった枠は開始・終了前とも除外し、取り下げた当日の集合も除外する', () => {
    const now = MON(8, 0)
    const ex = collectExcludedIds({
      announced: [],
      attendedRec: { date: '2026-09-14', courseName: '線形代数1', confirmWindow: '10:40〜12:10', code: '' },
      retracted: ['att:s:20260914-1300'],
      todayNotices: todaySlotNotices([LINALG_MON2], now),
      today: '2026-09-14',
    })
    expect([...ex].sort()).toEqual(['att:l:20260914-1200', 'att:s:20260914-1040', 'att:s:20260914-1300'])
  })

  it('記録（attendance.announcedSlots.v1 の中身）は当日以外を捨て、同じ枠を重複させない', () => {
    expect(addAnnouncedSlotId(['att:s:20260913-1040', 'att:s:20260914-0900'], 'att:s:20260914-0900', '2026-09-14')).toEqual([
      'att:s:20260914-0900',
    ])
    expect(addAnnouncedSlotId(['att:s:20260914-0900'], 'att:s:20260914-1040', '2026-09-14')).toEqual([
      'att:s:20260914-0900',
      'att:s:20260914-1040',
    ])
  })
})

describe('T13 M2 出席済み → コマ', () => {
  const today = '2026-09-14'
  const now = MON(11, 0)
  const rec = (over: Partial<AttendedRecord> = {}): AttendedRecord => ({
    date: today, courseName: '線形代数1', confirmWindow: '10:40〜12:10', code: '', ...over,
  })
  const TWICE = n1col([
    { day: 'mon', period: 2, classes: [n1cls('C1', '線形代数1')] },
    { day: 'mon', period: 4, classes: [n1cls('C1', '線形代数1')] },
  ])

  it('今日・同じ名前・窓が重なる → 開始・終了前とも', () => {
    expect(matchAttendedSlots(todaySlotNotices([LINALG_MON2], now), rec(), today)).toEqual([
      'att:s:20260914-1040',
      'att:l:20260914-1200',
    ])
  })

  it('陰性: 別の日・別の科目・窓が重ならない → 何も当てない', () => {
    const n = todaySlotNotices([LINALG_MON2], now)
    expect(matchAttendedSlots(n, rec({ date: '2026-09-13' }), today)).toEqual([])
    expect(matchAttendedSlots(n, rec({ courseName: '物理学1' }), today)).toEqual([])
    expect(matchAttendedSlots(n, rec({ confirmWindow: '18:00〜18:30' }), today)).toEqual([])
    expect(matchAttendedSlots(n, null, today)).toEqual([])
  })

  it('受付時間が無い記録 → 今が枠の中でも何も消えない（今の時刻で代用しない）', () => {
    expect(matchAttendedSlots(todaySlotNotices([LINALG_MON2], now), rec({ confirmWindow: null }), today)).toEqual([])
  })

  it('M3: まとめた枠（A・B）の一部に当たったら枠ごと扱う（受付open も出席済みも）', () => {
    // 設計 §4.3 の照合規則は「全部テストする」。M3 は科目名が違う積みコマで、B だけに当たった時に枠ごとになることを見る。
    const STACK = n1col([{ day: 'mon', period: 2, classes: [n1cls('Q1', '情報科学概論A'), n1cls('Q2', '情報科学概論B')] }])
    const n = todaySlotNotices([STACK], now)
    expect(matchOpenSlot(n, '情報科学概論B', MON(10, 45))).toBe('att:s:20260914-1040')
    expect(matchAttendedSlots(n, rec({ courseName: '情報科学概論B' }), today)).toEqual([
      'att:s:20260914-1040',
      'att:l:20260914-1200',
    ])
  })

  it('同じ科目が同じ日に2回（2限・4限）: 2限の受付時間の記録で4限は残る', () => {
    const ids = matchAttendedSlots(todaySlotNotices([TWICE], MON(15, 0)), rec(), today)
    expect(ids).toEqual(['att:s:20260914-1040', 'att:l:20260914-1200'])
    expect(ids).not.toContain('att:s:20260914-1440')
    expect(ids).not.toContain('att:l:20260914-1600')
  })
})
