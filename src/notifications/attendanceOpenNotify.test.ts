import { describe, it, expect } from 'vitest'
import {
  attendanceOpenKey,
  shouldNotifyAttendanceOpen,
  buildAttendanceOpenContent,
  pruneNotifiedAttendanceKeys,
} from './attendanceOpenNotify'

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
