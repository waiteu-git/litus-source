import { describe, it, expect } from 'vitest'
import {
  CLASS_MARGIN_AFTER_MIN,
  CLASS_MARGIN_BEFORE_MIN,
  failureAtFromHealth,
  failureAtFromSubmitDiags,
  hadValueToday,
  latestFailureAt,
  nearClassPeriod,
  reviewKillStatus,
} from './reviewSignals'
import type { CollectionHealthMap } from '../storage/collectionHealthSerialize'
import type { KillSwitchStatus } from '../health/killSwitch'
import type { TimetableCollection } from '../collect/timetableMessage'

const local = (m: number, d: number, h = 12, min = 0) => new Date(2026, m - 1, d, h, min, 0).getTime()

describe('failureAtFromSubmitDiags（出席・リアペ送信の失敗）', () => {
  it('ok:false の at の最大値を返す（ISO 文字列を epoch ms へ）', () => {
    const t1 = '2026-09-10T03:00:00.000Z'
    const t2 = '2026-09-20T03:00:00.000Z'
    expect(
      failureAtFromSubmitDiags([
        { at: t1, ok: false },
        { at: t2, ok: false },
      ]),
    ).toBe(Date.parse(t2))
  })

  it('成功（ok:true）は数えない', () => {
    expect(failureAtFromSubmitDiags([{ at: '2026-09-20T03:00:00.000Z', ok: true }])).toBeNull()
  })

  it('入力コードの誤り（ok:false・wrong:true）も失敗に数える＝待つ側へ倒す', () => {
    expect(failureAtFromSubmitDiags([{ at: '2026-09-20T03:00:00.000Z', ok: false }])).toBe(
      Date.parse('2026-09-20T03:00:00.000Z'),
    )
  })

  it('成功と失敗が混ざっていても、失敗のうち最新を返す', () => {
    expect(
      failureAtFromSubmitDiags([
        { at: '2026-09-22T00:00:00.000Z', ok: true },
        { at: '2026-09-15T00:00:00.000Z', ok: false },
      ]),
    ).toBe(Date.parse('2026-09-15T00:00:00.000Z'))
  })

  it('空・不正な日時は無視し、何も無ければ null', () => {
    expect(failureAtFromSubmitDiags([])).toBeNull()
    expect(failureAtFromSubmitDiags([{ at: 'not a date', ok: false }])).toBeNull()
  })
})

describe('failureAtFromHealth（収集の健全性）', () => {
  it('structure_drift と blocked を失敗に数え、4収集すべてを見る', () => {
    const map: CollectionHealthMap = {
      bulletin: { health: { status: 'structure_drift' }, at: 100 },
      timetable: { health: { status: 'blocked' }, at: 300 },
      letusAssignments: { health: { status: 'blocked' }, at: 200 },
      attendanceStats: { health: { status: 'structure_drift' }, at: 50 },
    }
    expect(failureAtFromHealth(map)).toBe(300)
  })

  it.each([
    ['ok', { status: 'ok', count: 3 }],
    ['empty_valid', { status: 'empty_valid' }],
    ['not_logged_in', { status: 'not_logged_in' }],
    ['maintenance', { status: 'maintenance' }],
  ] as const)('%s は失敗に数えない（大学側の事情・正常）', (_n, health) => {
    expect(failureAtFromHealth({ bulletin: { health, at: 999 } })).toBeNull()
  })

  it('失敗と正常が混ざる時は失敗の at だけを見る', () => {
    const map: CollectionHealthMap = {
      bulletin: { health: { status: 'ok', count: 1 }, at: 900 },
      letusAssignments: { health: { status: 'blocked' }, at: 400 },
    }
    expect(failureAtFromHealth(map)).toBe(400)
  })

  it('空のマップは null', () => {
    expect(failureAtFromHealth({})).toBeNull()
  })
})

describe('latestFailureAt', () => {
  it('null を除いた最大値', () => {
    expect(latestFailureAt(null, 5, 3, null)).toBe(5)
  })
  it('すべて null なら null', () => {
    expect(latestFailureAt(null, null)).toBeNull()
    expect(latestFailureAt()).toBeNull()
  })
})

describe('hadValueToday（課題・掲示の同期が今日成功していたか）', () => {
  const now = local(9, 24, 12)

  it('同期成功の時刻が今日（端末ローカル）なら true', () => {
    expect(hadValueToday(now, [local(9, 24, 0, 1)])).toBe(true)
    expect(hadValueToday(now, [local(9, 24, 11, 59)])).toBe(true)
  })

  it('昨日の同期は数えない（日付の境目）', () => {
    expect(hadValueToday(now, [local(9, 23, 23, 59)])).toBe(false)
  })

  it('未同期（0）・空は false', () => {
    expect(hadValueToday(now, [0])).toBe(false)
    expect(hadValueToday(now, [])).toBe(false)
  })

  it('未来の時刻（時計のずれ）は数えない', () => {
    expect(hadValueToday(now, [local(9, 24, 23, 0)])).toBe(false)
  })

  it('どれか1つでも今日なら true', () => {
    expect(hadValueToday(now, [local(9, 20), local(9, 24, 8)])).toBe(true)
  })
})

describe('reviewKillStatus（停止指示・お知らせの否決用の結論）', () => {
  const base: KillSwitchStatus = { disabledAll: false, disabled: [], message: null, title: null, calendar: null }

  it('null（未取得）は unknown＝出さない側', () => {
    expect(reviewKillStatus(null)).toBe('unknown')
  })

  it('全体停止は stopped', () => {
    expect(reviewKillStatus({ ...base, disabledAll: true })).toBe('stopped')
  })

  it('機能別停止も stopped', () => {
    expect(reviewKillStatus({ ...base, disabled: ['attendance'] })).toBe('stopped')
  })

  it('停止が無くお知らせ文面がある時は notice（既読かどうかは見ない）', () => {
    expect(reviewKillStatus({ ...base, message: '障害を調査中です' })).toBe('notice')
  })

  it('空白だけのお知らせは無いものとして扱う（notice.ts と同じ）', () => {
    expect(reviewKillStatus({ ...base, message: '  \n ' })).toBe('clear')
    expect(reviewKillStatus({ ...base, message: '' })).toBe('clear')
  })

  it('何も無ければ clear', () => {
    expect(reviewKillStatus(base)).toBe('clear')
  })

  it('停止とお知らせが両方ある時は stopped が先', () => {
    expect(reviewKillStatus({ ...base, disabledAll: true, message: 'x' })).toBe('stopped')
  })
})

describe('nearClassPeriod（授業の前後の余白＝コマ間・授業直後に出さない）', () => {
  // 2026-07-06 は月曜。1限 9:00〜10:30、2限 10:40〜12:10。
  const periodTimes = {
    campus: '野田',
    periods: [
      { period: 1, start: '9:00', end: '10:30' },
      { period: 2, start: '10:40', end: '12:10' },
    ],
  }
  const col = (day: 'mon' | 'tue', period: number, hasClass = true): TimetableCollection => ({
    slots: [
      {
        day,
        period,
        classes: hasClass
          ? [{ courseCode: 'AB1234', name: '線形代数', teachers: [], room: '', isRemote: false, credits: null, badges: [] }]
          : [],
      },
    ],
    periodTimes,
  })
  const ACTIVE = () => true
  const at = (h: number, m: number) => new Date(2026, 6, 6, h, m)

  it('余白の大きさは授業の25分前から・終了の10分後まで', () => {
    expect(CLASS_MARGIN_BEFORE_MIN).toBe(25)
    expect(CLASS_MARGIN_AFTER_MIN).toBe(10)
  })

  it('授業が始まる25分前までは true・26分前は false（前の余白の境界）', () => {
    expect(nearClassPeriod([col('mon', 1)], at(8, 35), ACTIVE)).toBe(true)
    expect(nearClassPeriod([col('mon', 1)], at(8, 34), ACTIVE)).toBe(false)
  })

  it('授業中は true', () => {
    expect(nearClassPeriod([col('mon', 1)], at(9, 30), ACTIVE)).toBe(true)
  })

  it('授業が終わって10分後までは true・11分後は false（後ろの余白の境界）', () => {
    expect(nearClassPeriod([col('mon', 1)], at(10, 40), ACTIVE)).toBe(true)
    expect(nearClassPeriod([col('mon', 1)], at(10, 41), ACTIVE)).toBe(false)
  })

  it('休み時間（1限終了直後〜2限開始前）は true', () => {
    expect(nearClassPeriod([col('mon', 1), col('mon', 2)], at(10, 35), ACTIVE)).toBe(true)
  })

  it('曜日が違う・その時限に授業が無い・科目が終了済みなら false（陰性対照）', () => {
    expect(nearClassPeriod([col('tue', 1)], at(9, 30), ACTIVE)).toBe(false)
    expect(nearClassPeriod([col('mon', 1, false)], at(9, 30), ACTIVE)).toBe(false)
    expect(nearClassPeriod([col('mon', 1)], at(9, 30), () => false)).toBe(false)
  })

  it('時間割が空なら false', () => {
    expect(nearClassPeriod([], at(9, 30), ACTIVE)).toBe(false)
  })
})
